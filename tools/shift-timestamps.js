/**
 * shift-timestamps.js — bump every `{c: MM:SS}` timestamp in a chart
 * forward or backward by a number of seconds.
 *
 * Usage:
 *   node tools/shift-timestamps.js <chart.md> <seconds> [--dry-run]
 *
 *   <seconds> may be negative or fractional: 3, -2, +1.5
 *
 * Only `{c: MM:SS}` timestamp comments are touched — text comments like
 * `{c: Needs timing done.}` are left alone. Results that would go negative
 * are clamped to 00:00 (with a warning), since the scroll sync expects
 * non-negative times.
 */

const fs = require("fs");
const path = require("path");

const TIMESTAMP_RE = /\{c: *(\d+):(\d{2})\}/g;

function formatTimestamp(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const positional = args.filter((a) => a !== "--dry-run");
  const [file, offsetArg] = positional;
  const offset = Number(offsetArg);

  if (!file || positional.length !== 2 || !Number.isFinite(offset)) {
    console.error(
      "Usage: node tools/shift-timestamps.js <chart.md> <seconds> [--dry-run]",
    );
    process.exit(1);
  }

  const filePath = path.resolve(file);
  const rel = path.relative(process.cwd(), filePath);
  const content = fs.readFileSync(filePath, "utf8");

  let count = 0;
  let clamped = 0;
  const output = content.replace(TIMESTAMP_RE, (tag, mm, ss) => {
    const seconds = Number(mm) * 60 + Number(ss) + offset;
    if (seconds < 0) clamped++;
    count++;
    return `{c: ${formatTimestamp(Math.max(seconds, 0))}}`;
  });

  if (count === 0) {
    console.log(`${rel} — no {c: MM:SS} timestamps found, nothing to do`);
    return;
  }
  if (clamped > 0) {
    console.warn(
      `WARNING: ${clamped} timestamp(s) would go negative — clamped to 00:00`,
    );
  }

  console.log(
    `${dryRun ? "DRY " : ""}${rel} — ${count} timestamp(s) shifted by ${offset > 0 ? "+" : ""}${offset}s`,
  );
  if (dryRun) {
    const before = [...content.matchAll(TIMESTAMP_RE)].map((m) => m[0]);
    const after = [...output.matchAll(TIMESTAMP_RE)].map((m) => m[0]);
    for (let i = 0; i < Math.min(before.length, 5); i++) {
      console.log(`    ${before[i]} → ${after[i]}`);
    }
    if (before.length > 5) console.log(`    … ${before.length - 5} more`);
  } else {
    fs.writeFileSync(filePath, output);
  }
}

main();
