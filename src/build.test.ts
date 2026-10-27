import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { loadArtwork } from "./artwork.ts";
import { WORDMARK } from "./brand.ts";
import { sync } from "./build.ts";
import { plan, type Inputs } from "./tree.ts";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

const README_FIXTURE = `SENTINEL_README

<!-- brand:hero -->
OLD_INSIDE
<!-- /brand:hero -->

<!-- brand:palette -->
OLD_INSIDE
<!-- /brand:palette -->

<!-- brand:typography -->
OLD_INSIDE
<!-- /brand:typography -->

<!-- brand:assets -->
OLD_INSIDE
<!-- /brand:assets -->
`;

const CLAUDE_FIXTURE = `SENTINEL_CLAUDE

<!-- brand:palette -->
OLD_INSIDE
<!-- /brand:palette -->

<!-- brand:typography -->
OLD_INSIDE
<!-- /brand:typography -->

<!-- brand:assets -->
OLD_INSIDE
<!-- /brand:assets -->
`;

const RETIRED = [
  "#7fb4ca",
  "#c4b28a",
  "#a8703a",
  "#181616",
  "#f5f1e8",
  "#c5c9c5",
  "#2a3a4a",
  "Pixelify",
  "crystalBlue",
  "8 nodes",
  "8 lights",
  "gold node",
  "choose B",
];

const APP_ICON_BODY =
  '<rect width="32" height="32" rx="6" fill="#0b0d12"/>' +
  '<path d="M8 15 A5 5 0 0 1 18 15 V24" fill="none" stroke="#d5dae1" stroke-width="4" stroke-linecap="butt"/>' +
  '<rect x="6" y="18" width="4" height="10" fill="#d5dae1"/>' +
  '<rect x="21.5" y="19" width="5" height="5" fill="#d5dae1"/>';

async function fontBytes(): Promise<Uint8Array> {
  return new Uint8Array(await readFile(path.join(repoRoot, WORDMARK.fontFile)));
}

async function inputs(): Promise<Inputs> {
  return {
    wordmarkFont: await fontBytes(),
    docs: { "README.md": README_FIXTURE, "CLAUDE.md": CLAUDE_FIXTURE },
  };
}

async function makeRepo(): Promise<URL> {
  const dir = await mkdtemp(path.join(tmpdir(), "brand-"));
  await mkdir(path.join(dir, "fonts/geist-mono"), { recursive: true });
  await copyFile(path.join(repoRoot, WORDMARK.fontFile), path.join(dir, WORDMARK.fontFile));
  await writeFile(path.join(dir, "README.md"), README_FIXTURE);
  await writeFile(path.join(dir, "CLAUDE.md"), CLAUDE_FIXTURE);
  return pathToFileURL(`${dir}${path.sep}`);
}

function patchWeight(font: Uint8Array, weight: number): Uint8Array {
  const copy = new Uint8Array(font);
  const view = new DataView(copy.buffer);
  const tableCount = view.getUint16(4);
  for (let index = 0; index < tableCount; index += 1) {
    const record = 12 + index * 16;
    const tag = String.fromCharCode(
      view.getUint8(record),
      view.getUint8(record + 1),
      view.getUint8(record + 2),
      view.getUint8(record + 3),
    );
    if (tag !== "OS/2") continue;
    view.setUint16(view.getUint32(record + 8) + 4, weight);
    return copy;
  }
  throw new Error("OS/2 table not found");
}

test("a second write returns no drift", async () => {
  const root = await makeRepo();
  try {
    await sync(root, "write");
    assert.deepEqual(await sync(root, "write"), []);
  } finally {
    await rm(fileURLToPath(root), { recursive: true, force: true });
  }
});

test("a stray file in mark is deleted and prose outside the markers survives", async () => {
  const root = await makeRepo();
  const dir = fileURLToPath(root);
  try {
    await sync(root, "write");
    await writeFile(path.join(dir, "mark/stray.txt"), "stray");
    assert.deepEqual(await sync(root, "write"), [{ change: "delete", path: "mark/stray.txt" }]);
    await assert.rejects(readFile(path.join(dir, "mark/stray.txt")));
    const readme = await readFile(path.join(dir, "README.md"), "utf8");
    assert.equal(readme.includes("SENTINEL_README"), true);
    assert.equal(readme.includes("OLD_INSIDE"), false);
    const claude = await readFile(path.join(dir, "CLAUDE.md"), "utf8");
    assert.equal(claude.includes("SENTINEL_CLAUDE"), true);
    assert.equal(claude.includes("OLD_INSIDE"), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("the app icon svg is the source tile with the dark colors filled in", async () => {
  const bytes = plan(await inputs()).files.get("icon/favicon.svg");
  assert.ok(bytes);
  const svg = new TextDecoder().decode(bytes);
  const body = svg.slice(svg.indexOf(">") + 1, svg.lastIndexOf("</svg>"));
  assert.equal(body, APP_ICON_BODY);
});

test("generated svgs and the preview do not request a remote resource", async () => {
  const files = plan(await inputs()).files;
  for (const [filePath, bytes] of files) {
    if (!filePath.endsWith(".svg")) continue;
    const svg = new TextDecoder().decode(bytes);
    assert.equal(svg.includes("<text"), false, filePath);
    assert.equal(svg.includes("@font-face"), false, filePath);
    assert.equal(svg.includes("@import"), false, filePath);
    assert.equal(svg.includes("fonts.googleapis"), false, filePath);
    assert.equal(svg.split("http").length - 1, 1, filePath);
    assert.equal(svg.includes('xmlns="http://www.w3.org/2000/svg"'), true, filePath);
  }
  const preview = files.get("preview/index.html");
  assert.ok(preview);
  const html = new TextDecoder().decode(preview);
  assert.equal(html.includes("http"), false);
  assert.equal(html.includes("@import"), false);
  assert.equal(html.includes("fonts.googleapis"), false);
  for (const filePath of files.keys()) {
    if (!filePath.includes("/") || filePath === "preview/index.html") continue;
    assert.equal(html.includes(`../${filePath}`), true, filePath);
  }
});

test("loadArtwork rejects the wordmark font when usWeightClass is 400", async () => {
  const font = await fontBytes();
  loadArtwork(font);
  assert.throws(() => loadArtwork(patchWeight(font, 400)));
});

test("retired words stay out of the docs", async () => {
  for (const name of ["README.md", "CLAUDE.md"]) {
    const text = (await readFile(path.join(repoRoot, name), "utf8")).toLowerCase();
    for (const token of RETIRED) {
      assert.equal(text.includes(token.toLowerCase()), false, `${name} contains ${token}`);
    }
  }
});

test("node --run check exits 0 on a clean tree", async () => {
  const child = spawn("node", ["--run", "check"], { cwd: repoRoot });
  let output = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk: string) => {
    output += chunk;
  });
  const code = await new Promise<number>((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (status) => resolve(status ?? 1));
  });
  assert.equal(code, 0, output);
});
