import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const failures = [];

const requiredFiles = [
  "README.md",
  "LICENSE",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "ROADMAP.md",
  "CHANGELOG.md",
  ".env.example",
  "compose.yaml",
  "docs/README.md",
  "docs/assets/freewill-world.png",
  "public/little-worlds/lw-assets.js",
  "public/little-worlds/lw-assets-plus.js",
  "public/little-worlds/lw-engine.js",
  "public/little-worlds/lw-riverbend.js",
  "public/little-worlds/lw-village.js",
  "public/little-worlds/lw-civ.js",
  "public/little-worlds/lw-market.js",
];

for (const file of requiredFiles) {
  if (!existsSync(join(root, file))) failures.push(`missing required file: ${file}`);
}

function walk(path, output = []) {
  if (!existsSync(path)) return output;
  for (const name of readdirSync(path)) {
    const child = join(path, name);
    const stats = statSync(child);
    if (stats.isDirectory()) walk(child, output);
    else output.push(child);
  }
  return output;
}

const markdownFiles = [
  join(root, "README.md"),
  join(root, "CONTRIBUTING.md"),
  join(root, "SECURITY.md"),
  join(root, "ROADMAP.md"),
  ...walk(join(root, "docs")).filter((file) => extname(file) === ".md"),
].filter(existsSync);

for (const file of markdownFiles) {
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const href = match[1].split("#")[0];
    if (!href || /^(https?:|mailto:)/.test(href)) continue;
    const target = resolve(dirname(file), decodeURI(href));
    if (!existsSync(target)) failures.push(`broken link in ${file.slice(root.length + 1)}: ${match[1]}`);
  }
}

const scanRoots = ["src", "server", "services", "public", "docs", ".github"];
const secretPatterns = [
  /sk-[A-Za-z0-9_-]{20,}/,
  /ghp_[A-Za-z0-9]{30,}/,
  /github_pat_[A-Za-z0-9_]{30,}/,
];

for (const relative of scanRoots) {
  for (const file of walk(join(root, relative))) {
    if (statSync(file).size > 2_000_000) continue;
    const source = readFileSync(file, "utf8");
    if (secretPatterns.some((pattern) => pattern.test(source))) {
      failures.push(`possible credential in ${file.slice(root.length + 1)}`);
    }
  }
}

if (existsSync(join(root, ".git"))) {
  for (const ignored of [
    ".env",
    "Little Worlds Pixel Simulator",
    "Copy of Little Worlds Pixel Simulator economy",
    ".design-references",
    "data",
  ]) {
    try {
      execFileSync("git", ["check-ignore", "-q", ignored], { cwd: root });
    } catch {
      failures.push(`expected Git ignore rule missing for: ${ignored}`);
    }
  }
}

if (failures.length > 0) {
  console.error("Release verification failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log(`Release verification passed (${markdownFiles.length} Markdown files checked).`);

