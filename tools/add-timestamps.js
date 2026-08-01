/**
 * add-timestamps.js — fetch synced lyrics from LRCLIB (lrclib.net) and append
 * `{c: MM:SS}` timestamps to a chart's lyric lines, in the same trailing
 * position used by hand-timed charts (see Closing-Time.md).
 *
 * Usage:
 *   node tools/add-timestamps.js <chart.md> [<chart.md> ...] [options]
 *   node tools/add-timestamps.js --all [options]
 *
 * Options:
 *   --all         process every registry chart whose file has no timestamps yet
 *   --dry-run     print the would-be changes, write nothing
 *   --ends-only   only timestamp the first + last lyric line of each section
 *                 (default: every lyric line that gets a confident match)
 *
 * How it works:
 *   1. The chart file is looked up in web-root/charts/!registry.json to get
 *      its title/artist (files with existing `{c: MM:SS}` tags are skipped).
 *   2. LRCLIB's public API (no key) is queried for synced lyrics — per-line
 *      `[MM:SS.xx]` timestamps contributed from Musixmatch/community.
 *   3. Chart lyric lines (chords stripped, punctuation normalised) are
 *      matched against the LRC lines with a bigram-similarity score under a
 *      monotonic-time constraint, so repeated chorus lines pair up in order.
 *   4. Matched target lines get ` {c: MM:SS}` appended; a `{c: Needs timing
 *      done.}` marker line is removed if timestamps were added.
 *
 * Timestamps are the line's *start* time. Unmatched lines are reported so
 * the remainder can be timed by hand; scroll sync interpolates between the
 * events it finds, so partial timing degrades gracefully.
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

const API_BASE = "https://lrclib.net/api";
const USER_AGENT = "guitar-chords-chart-tool (personal use)";
const MIN_SIMILARITY = 0.5;

/* ---------------------------------------------------------------- */
/* Text normalisation + similarity                                   */
/* ---------------------------------------------------------------- */

/** Strip [chords] and {directives}, lowercase, drop punctuation. */
function normalizeLyric(line) {
  return line
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\{[^}]*\}/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Sørensen–Dice similarity over character bigrams (0..1). */
function similarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const bigrams = (s) => {
    const m = new Map();
    for (let i = 0; i < s.length - 1; i++) {
      const bg = s.slice(i, i + 2);
      m.set(bg, (m.get(bg) || 0) + 1);
    }
    return m;
  };
  const ma = bigrams(a);
  const mb = bigrams(b);
  let shared = 0;
  for (const [bg, na] of ma) shared += Math.min(na, mb.get(bg) || 0);
  const total = Math.max(a.length - 1, 0) + Math.max(b.length - 1, 0);
  return total === 0 ? 0 : (2 * shared) / total;
}

/* ---------------------------------------------------------------- */
/* LRCLIB                                                            */
/* ---------------------------------------------------------------- */

/** Parse LRC text into [{ seconds, norm, raw }] sorted by time. */
function parseLrc(lrc) {
  const out = [];
  for (const line of lrc.split("\n")) {
    const tags = [...line.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    if (tags.length === 0) continue;
    const text = line.replace(/\[\d+:\d+(?:\.\d+)?\]/g, "").trim();
    const norm = normalizeLyric(text);
    if (!norm) continue;
    for (const t of tags) {
      out.push({ seconds: Number(t[1]) * 60 + Number(t[2]), norm, raw: text });
    }
  }
  return out.sort((a, b) => a.seconds - b.seconds);
}

/**
 * Fetch synced lyrics for title/artist.
 * Returns { lrc, trackName, artistName } (what LRCLIB matched, which may
 * differ from the query) or null.
 */
async function fetchSyncedLyrics(title, artist) {
  const headers = { "User-Agent": USER_AGENT };
  const asResult = (r) =>
    r && r.syncedLyrics
      ? { lrc: r.syncedLyrics, trackName: r.trackName, artistName: r.artistName }
      : null;

  const get = new URL(`${API_BASE}/get`);
  get.searchParams.set("track_name", title);
  get.searchParams.set("artist_name", artist);
  let res = await fetch(get, { headers });
  if (res.ok) {
    const hit = asResult(await res.json());
    if (hit) return hit;
  }
  // Fall back to search — /get wants an exact metadata match.
  const search = new URL(`${API_BASE}/search`);
  search.searchParams.set("track_name", title);
  search.searchParams.set("artist_name", artist);
  res = await fetch(search, { headers });
  if (!res.ok) return null;
  const results = await res.json();
  return asResult(results.find((r) => r.syncedLyrics));
}

/* ---------------------------------------------------------------- */
/* Chart parsing + matching                                          */
/* ---------------------------------------------------------------- */

/** Collect lyric lines per section: [{ lineIndexes: [...] }] */
function collectSections(lines) {
  const sections = [];
  let current = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (/^\{(?:start_of_|so[vcb]:)/.test(line)) {
      current = { lineIndexes: [] };
      sections.push(current);
      continue;
    }
    if (/^\{(?:end_of_|eo[vcb]\})/.test(line)) {
      current = null;
      continue;
    }
    if (current && normalizeLyric(line)) current.lineIndexes.push(i);
  }
  return sections.filter((s) => s.lineIndexes.length > 0);
}

/**
 * Align chart lyric lines to LRC lines with dynamic programming
 * (Needleman–Wunsch style), so repeated choruses pair with the *right*
 * occurrence instead of a greedy jump to the best-scoring one anywhere.
 *
 * Charts and LRC also split lines differently, so besides 1:1 pairs the
 * alignment allows a chart line spanning two joined LRC lines, and two
 * chart lines sharing one LRC line (the second gets a timestamp
 * interpolated by its position within the line).
 *
 * Returns Map<lineIndex, seconds>.
 */
function matchLines(lines, lyricLineIndexes, lrc) {
  const chart = lyricLineIndexes.map((lineIndex) => ({
    lineIndex,
    norm: normalizeLyric(lines[lineIndex]),
  }));
  const n = chart.length;
  const m = lrc.length;
  const GAP_CHART = -0.15; // skipping a chart line costs a little
  const GAP_LRC = -0.02; // extra LRC lines (ad-libs, repeats) are cheap

  const pairScore = (a, b) => {
    const s = similarity(a, b);
    return s >= MIN_SIMILARITY ? s : -Infinity;
  };

  // dp[i][j]: best score for chart[0..i) vs lrc[0..j). move[i][j] encodes
  // how we got there: 1 = skip chart, 2 = skip lrc, 3 = 1:1 match,
  // 4 = chart line spans lrc j-2,j-1, 5 = chart i-2,i-1 share lrc j-1.
  const dp = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  const move = Array.from({ length: n + 1 }, () => new Uint8Array(m + 1));
  for (let i = 1; i <= n; i++) {
    dp[i][0] = i * GAP_CHART;
    move[i][0] = 1;
  }
  for (let j = 1; j <= m; j++) {
    dp[0][j] = j * GAP_LRC;
    move[0][j] = 2;
  }
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      let best = dp[i - 1][j] + GAP_CHART;
      let bestMove = 1;
      const skipLrc = dp[i][j - 1] + GAP_LRC;
      if (skipLrc > best) {
        best = skipLrc;
        bestMove = 2;
      }
      const one = dp[i - 1][j - 1] + pairScore(chart[i - 1].norm, lrc[j - 1].norm);
      if (one > best) {
        best = one;
        bestMove = 3;
      }
      if (j >= 2) {
        const span =
          dp[i - 1][j - 2] +
          pairScore(chart[i - 1].norm, `${lrc[j - 2].norm} ${lrc[j - 1].norm}`);
        if (span > best) {
          best = span;
          bestMove = 4;
        }
      }
      if (i >= 2) {
        const share =
          dp[i - 2][j - 1] +
          pairScore(`${chart[i - 2].norm} ${chart[i - 1].norm}`, lrc[j - 1].norm);
        if (share > best) {
          best = share;
          bestMove = 5;
        }
      }
      dp[i][j] = best;
      move[i][j] = bestMove;
    }
  }

  // Duration of LRC line j, for interpolating shared-line fragments.
  const lineDur = (j) =>
    Math.min((lrc[j + 1] ? lrc[j + 1].seconds : lrc[j].seconds + 4) - lrc[j].seconds, 15);

  const matches = new Map();
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    switch (move[i][j]) {
      case 1:
        i -= 1;
        break;
      case 2:
        j -= 1;
        break;
      case 3:
        matches.set(chart[i - 1].lineIndex, lrc[j - 1].seconds);
        i -= 1;
        j -= 1;
        break;
      case 4:
        matches.set(chart[i - 1].lineIndex, lrc[j - 2].seconds);
        i -= 1;
        j -= 2;
        break;
      case 5: {
        const first = chart[i - 2].norm;
        const both = `${first} ${chart[i - 1].norm}`;
        const frac = first.length / both.length;
        matches.set(chart[i - 2].lineIndex, lrc[j - 1].seconds);
        matches.set(
          chart[i - 1].lineIndex,
          lrc[j - 1].seconds + frac * lineDur(j - 1),
        );
        i -= 2;
        j -= 1;
        break;
      }
      default:
        // move 0 only at (0,0)
        i = 0;
        j = 0;
    }
  }
  return matches;
}

function formatTimestamp(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/* ---------------------------------------------------------------- */
/* Per-file processing                                               */
/* ---------------------------------------------------------------- */

async function processChart(filePath, registry, { dryRun, endsOnly }) {
  const rel = path.relative(process.cwd(), filePath);
  const content = fs.readFileSync(filePath, "utf8");
  if (/\{c: *\d+:\d+\}/.test(content)) {
    console.log(`SKIP ${rel} — already has timestamps`);
    return;
  }

  const fileName = path.basename(filePath);
  const entry = registry.charts.find(
    (c) => path.basename(c.path) === fileName,
  );
  if (!entry) {
    console.log(`SKIP ${rel} — no registry entry`);
    return;
  }

  const hit = await fetchSyncedLyrics(entry.title, entry.artist);
  if (!hit) {
    console.log(
      `SKIP ${rel} — no synced lyrics on LRCLIB for "${entry.title}" by ${entry.artist}`,
    );
    return;
  }
  console.log(
    `${rel}: registry "${entry.title}" by ${entry.artist} → LRCLIB matched "${hit.trackName}" by ${hit.artistName}`,
  );
  const lrc = parseLrc(hit.lrc);

  const lines = content.split("\n");
  const sections = collectSections(lines);
  if (sections.length === 0) {
    console.log(`SKIP ${rel} — no lyric lines found in sections`);
    return;
  }

  // Match every lyric line (better anchoring), then choose which to write.
  const allLyricIndexes = sections.flatMap((s) => s.lineIndexes);
  const matches = matchLines(lines, allLyricIndexes, lrc);

  const targets = new Set(
    endsOnly
      ? sections.flatMap((s) => [
          s.lineIndexes[0],
          s.lineIndexes[s.lineIndexes.length - 1],
        ])
      : allLyricIndexes,
  );

  let written = 0;
  const unmatched = [];
  for (const lineIndex of targets) {
    if (!matches.has(lineIndex)) {
      unmatched.push(lines[lineIndex].trim());
      continue;
    }
    const tag = `{c: ${formatTimestamp(matches.get(lineIndex))}}`;
    lines[lineIndex] = `${lines[lineIndex].replace(/\s+$/, "")} ${tag}`;
    written++;
  }

  let output = lines.join("\n");
  if (written > 0) {
    output = output.replace(/^\{c: *Needs timing[^}]*\}\n?/im, "");
  }

  console.log(
    `${dryRun ? "DRY " : ""}${rel} — ${written}/${targets.size} target lines timestamped` +
      (unmatched.length ? `; unmatched: ${unmatched.length}` : ""),
  );
  for (const line of unmatched) console.log(`    no match: ${line}`);

  if (!dryRun && written > 0) fs.writeFileSync(filePath, output);
  if (dryRun && written > 0) {
    for (const i of [...targets].sort((a, b) => a - b)) {
      if (matches.has(i)) console.log(`    ${lines[i]}`);
    }
  }
}

/* ---------------------------------------------------------------- */
/* Main                                                              */
/* ---------------------------------------------------------------- */

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const endsOnly = args.includes("--ends-only");
  const all = args.includes("--all");
  const files = args.filter((a) => !a.startsWith("--"));

  const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8"));

  let targets;
  if (all) {
    const chartsDir = path.dirname(REGISTRY_PATH);
    targets = registry.charts
      .map((c) => path.join(chartsDir, path.basename(c.path)))
      .filter((p) => fs.existsSync(p));
  } else if (files.length > 0) {
    targets = files.map((f) => path.resolve(f));
  } else {
    console.error(
      "Usage: node tools/add-timestamps.js <chart.md ...> | --all [--dry-run] [--every-line]",
    );
    process.exit(1);
  }

  for (const [i, file] of targets.entries()) {
    await processChart(file, registry, { dryRun, endsOnly });
    // Be polite to LRCLIB when batch-processing.
    if (all && i < targets.length - 1) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
