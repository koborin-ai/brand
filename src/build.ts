import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { WORDMARK } from "./brand.ts";
import {
  DOCUMENTS,
  isPublicPath,
  plan,
  type DesiredTree,
  type DocFile,
  type Inputs,
  type PublicPath,
  type RepoPath,
} from "./tree.ts";

export type Mode = "write" | "check";

export type Drift =
  | { readonly change: "create" | "update"; readonly path: RepoPath }
  | { readonly change: "delete"; readonly path: PublicPath };

const ROOT = pathToFileURL(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));

function parseMode(argv: readonly string[]): Mode {
  if (argv.length === 0) return "write";
  if (argv.length === 1 && argv[0] === "--check") return "check";
  throw new Error("usage: node src/build.ts [--check]");
}

async function readInputs(root: URL): Promise<Inputs> {
  const wordmarkFont = new Uint8Array(await readFile(fileIn(root, WORDMARK.fontFile)));
  const docs = {} as { [K in DocFile]: string };
  for (const doc of DOCUMENTS) docs[doc.path] = await readFile(fileIn(root, doc.path), "utf8");
  return { wordmarkFont, docs };
}

function fileIn(root: URL, repoPath: string): string {
  return path.join(fileURLToPath(root), repoPath);
}

function isEnoent(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

async function listFiles(dir: string): Promise<readonly string[]> {
  let entries;
  try {
    entries = await readdir(dir, { recursive: true, withFileTypes: true });
  } catch (error) {
    if (isEnoent(error)) return [];
    throw error;
  }
  const files: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const relative = path.relative(dir, path.join(entry.parentPath, entry.name)).split(path.sep).join("/");
    if (relative !== "") files.push(relative);
  }
  return files;
}

async function diff(root: URL, tree: DesiredTree): Promise<readonly Drift[]> {
  const drift: Drift[] = [];
  for (const [repoPath, bytes] of tree.files) {
    let current: Uint8Array | undefined;
    try {
      current = new Uint8Array(await readFile(fileIn(root, repoPath)));
    } catch (error) {
      if (!isEnoent(error)) throw error;
    }
    if (current === undefined) drift.push({ change: "create", path: repoPath });
    else if (!sameBytes(current, bytes)) drift.push({ change: "update", path: repoPath });
  }
  for (const family of tree.owned) {
    for (const relative of await listFiles(fileIn(root, family))) {
      const repoPath = `${family}/${relative}`;
      if (!isPublicPath(repoPath)) throw new Error(`unexpected path ${repoPath}`);
      if (!tree.files.has(repoPath)) drift.push({ change: "delete", path: repoPath });
    }
  }
  drift.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return drift;
}

async function apply(root: URL, tree: DesiredTree, drift: readonly Drift[]): Promise<void> {
  for (const entry of drift) {
    const target = fileIn(root, entry.path);
    if (entry.change === "delete") {
      await rm(target);
      continue;
    }
    const bytes = tree.files.get(entry.path);
    if (bytes === undefined) throw new Error(`missing bytes for ${entry.path}`);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, bytes);
  }
  for (const family of tree.owned) await pruneEmpty(fileIn(root, family));
}

async function pruneEmpty(dir: string): Promise<boolean> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (isEnoent(error)) return true;
    throw error;
  }
  let empty = true;
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const childEmpty = await pruneEmpty(path.join(dir, entry.name));
      if (!childEmpty) empty = false;
    } else {
      empty = false;
    }
  }
  if (empty) await rm(dir);
  return empty;
}

export async function sync(root: URL, mode: Mode): Promise<readonly Drift[]> {
  const tree = plan(await readInputs(root));
  const drift = await diff(root, tree);
  if (mode === "write") await apply(root, tree, drift);
  return drift;
}

async function main(argv: readonly string[]): Promise<number> {
  const mode = parseMode(argv);
  const drift = await sync(ROOT, mode);
  for (const entry of drift) console.log(`${entry.change} ${entry.path}`);
  console.log(`${drift.length} changes`);
  return mode === "check" && drift.length > 0 ? 1 : 0;
}

const invoked = process.argv[1];
if (invoked !== undefined && import.meta.url === pathToFileURL(path.resolve(invoked)).href) {
  process.exitCode = await main(process.argv.slice(2));
}
