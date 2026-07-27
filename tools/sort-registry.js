/**
 * sort-registry.js — sort web-root/charts/!registry.json in place.
 *
 * Usage: node tools/sort-registry.js
 *
 * Sort priority:
 *   1. category — Favourites, Likes, Training, Creating (anything else sinks to the end)
 *   2. defaultCapo — ascending (0/none first)
 *   3. difficulty — easy, ok, medium, hard, then null/tbd (case-insensitive)
 * Ties keep their existing relative order (stable sort).
 */

const fs = require("fs");
const path = require("path");

const REGISTRY_PATH = path.join(
  __dirname,
  "..",
  "web-root",
  "charts",
  "!registry.json",
);

const CATEGORY_ORDER = ["Favourites", "Likes", "Training", "Creating"];
const DIFFICULTY_ORDER = ["easy", "ok", "medium", "hard"];

function categoryRank(category) {
  const i = CATEGORY_ORDER.indexOf(category);
  return i === -1 ? CATEGORY_ORDER.length : i;
}

function difficultyRank(difficulty) {
  if (!difficulty) return DIFFICULTY_ORDER.length;
  const i = DIFFICULTY_ORDER.indexOf(difficulty.toLowerCase());
  return i === -1 ? DIFFICULTY_ORDER.length : i;
}

function compareEntries(a, b) {
  return (
    categoryRank(a.category) - categoryRank(b.category) ||
    (a.defaultCapo ?? 0) - (b.defaultCapo ?? 0) ||
    difficultyRank(a.difficulty) - difficultyRank(b.difficulty)
  );
}

function formatEntry(entry) {
  const lines = Object.keys(entry).map((key, i, keys) => {
    const comma = i < keys.length - 1 ? "," : "";
    if (key === "chords") {
      const arr = "[" + entry.chords.map((c) => JSON.stringify(c)).join(", ") + "]";
      return `      "chords": ${arr}${comma}`;
    }
    return `      ${JSON.stringify(key)}: ${JSON.stringify(entry[key])}${comma}`;
  });
  return "    {\n" + lines.join("\n") + "\n    }";
}

function main() {
  const raw = fs.readFileSync(REGISTRY_PATH, "utf8");
  const data = JSON.parse(raw);

  data.charts.sort(compareEntries);

  const body = data.charts.map(formatEntry).join(",\n");
  const out = "{\n  \"charts\": [\n" + body + "\n  ]\n}\n";

  fs.writeFileSync(REGISTRY_PATH, out);
  console.log(`Sorted ${data.charts.length} entries in ${REGISTRY_PATH}`);
}

main();
