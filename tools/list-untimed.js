/**
 * list-untimed.js — list charts that have no `{c: MM:SS}` timestamps yet.
 *
 * Usage: node tools/list-untimed.js
 *
 * A chart counts as timed when it contains a comment whose text is a
 * MM:SS timestamp (with or without a space after the colon — both occur
 * in existing charts, and the app accepts both). Registry title/artist
 * shown when the file has an entry.
 */

const fs = require("fs");
const path = require("path");

const CHARTS_DIR = path.join(__dirname, "..", "web-root", "charts");
const REGISTRY_PATH = path.join(CHARTS_DIR, "!registry.json");

// Same shape the app converts into scroll events (charts.js): a comment
// whose trimmed text is exactly two digits, colon, two digits.
const TIMESTAMP_RE = /\{c(?:omment)?: *\d{2}:\d{2} *\}/;

const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8"));
const byFile = new Map(
  registry.charts.map((c) => [path.basename(c.path), c]),
);

const files = fs
  .readdirSync(CHARTS_DIR)
  .filter((f) => f.endsWith(".md"))
  .sort();

const untimed = files.filter(
  (f) => !TIMESTAMP_RE.test(fs.readFileSync(path.join(CHARTS_DIR, f), "utf8")),
);

for (const f of untimed) {
  const entry = byFile.get(f);
  console.log(
    entry ? `${f} — "${entry.title}" by ${entry.artist}` : `${f} — (no registry entry)`,
  );
}
console.log(
  `\n${untimed.length} of ${files.length} charts have no timestamps`,
);
