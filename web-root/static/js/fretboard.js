/**
 * fretboard.js — chord-diagram rendering + shared localStorage helpers.
 *
 * Loaded first, so it also defines `window.Store`, the JSON-safe
 * localStorage wrapper used by every later module.
 *
 * Exposes: window.Store, window.Fretboard
 */

/* ------------------------------------------------------------------ */
/* Store — JSON-safe localStorage wrapper                            */
/* ------------------------------------------------------------------ */

window.Store = window.Store || {};

/**
 * Read and JSON-parse a localStorage value.
 * @param {string} key
 * @param {*} [fallback=null] returned when missing or unparseable
 * @returns {*}
 */
Store.getJSON = function (key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch (_) {
    return fallback;
  }
};

/**
 * JSON-stringify and store a value.
 * @param {string} key
 * @param {*} value
 */
Store.setJSON = function (key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (_) {}
};

/** Read a raw string value. @param {string} key @param {*} [fallback=null] */
Store.get = function (key, fallback = null) {
  const v = localStorage.getItem(key);
  return v == null ? fallback : v;
};

/** Store a raw string value. @param {string} key @param {string} value */
Store.set = function (key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (_) {}
};

/** Remove a key. @param {string} key */
Store.remove = function (key) {
  localStorage.removeItem(key);
};

/* ------------------------------------------------------------------ */
/* Fretboard — Fretboard Chord Diagram rendering                       */
/* ------------------------------------------------------------------ */

window.Fretboard = window.Fretboard || {};

/**
 * Chord name → 6-string fret spec (low-E to high-E).
 * "x" = muted, "0" = open, digit = fret number, "" = unknown.
 * Source: https://jguitar.com/chordsearch
 */
/**
 * Barre chord entries use an object: { strings, barre: { fret, from, to } }
 * where from/to are string numbers 1 (low-E) – 6 (high-e).
 * Plain strings are non-barre chords (backward-compatible).
 */
Fretboard.CHORD_LOOKUP = {
  A: "x02220",
  A5: "x022xx",
  A7: "x02020",
  Asus2: "x02200",
  Asus4: "x02230",
  Am: "x02210",
  Am7: "x02010",
  Ab5: "xxx144",
  Abm: "xx110x",
  Adim7: "x01212",
  //B: { strings: "x24442", barre: { fret: 2, from: 2, to: 6 } },
  B: { strings: "xx444x" }, // beginner stuff!
  Bm: { strings: "x24432", barre: { fret: 2, from: 2, to: 6 } },
  Bm7: "x20202",
  B7: "x21202",
  Bb: { strings: "x13331", barre: { fret: 1, from: 2, to: 6 } },
  Bb5: "x133xx",
  C: "x32010",
  Cm: "x31013",
  "C#m": "x4x120",
  C5: "xxxx13",
  C7: "x32310",
  Cadd9: "x32030",
  Cmaj7: "x32000",
  Csus2: "x30033",
  D: "xx0232",
  D5: "xx023x",
  D7: "xx0212",
  Dsus2: "xx0230",
  Dsus4: "xx0233",
  Dm: "xx0231",
  Dm7: "xx0211",
  E: "022100",
  E7: "020100",
  Em: "022000",
  Em7: "022033",
  E5: "022xxx",
  Esus2: "024400",
  Esus4: "022200",
  //Eb: "xx1343",
  Eb: "xxx343", // beginner stuff!
  Eb5: "xx134x",
  F: { strings: "133211", barre: { fret: 1, from: 1, to: 6 } },
  F7: { strings: "131211", barre: { fret: 1, from: 1, to: 6 } },
  Fm: { strings: "133111", barre: { fret: 1, from: 1, to: 6 } },
  "F#": { strings: "244322", barre: { fret: 2, from: 1, to: 6 } },
  "F#m": { strings: "244222", barre: { fret: 2, from: 1, to: 6 } },
  Fmaj7: "xx3210",
  G: "320003",
  G5: "3x003x",
  G6: "xx0000",
  G7: "320001",
  Gmaj7: "320002",
  Gsus2: "3x0233",
  Gsus4: "320013",
  Gm: "xx0333",
  "": "",
};

// Enharmonic equivalents for chord roots, both directions. Used as a lookup
// fallback so a chart spelling like Cbm or Dbm still finds its fingering
// (stored under Bm / C#m) while the diagram label keeps the chart's spelling.
Fretboard.ENHARMONIC_ROOTS = {
  Cb: "B",
  "B#": "C",
  Fb: "E",
  "E#": "F",
  Db: "C#",
  "C#": "Db",
  Eb: "D#",
  "D#": "Eb",
  Gb: "F#",
  "F#": "Gb",
  Ab: "G#",
  "G#": "Ab",
  Bb: "A#",
  "A#": "Bb",
};

// SVG geometry constants matching the fretboard template (horizontal layout:
// frets run left-to-right on the x-axis, strings run top-to-bottom on the y-axis)
Fretboard._CX = { 1: 33.35, 2: 56.35, 3: 79.35, 4: 102.35 };
Fretboard._CY = { 1: 109.54, 2: 89.54, 3: 69.54, 4: 49.54, 5: 29.54, 6: 9.54 };
Fretboard._R = 7;

/**
 * Clone the fretboard template and render the given chord into #fretboards.
 * @param {string} name chord name to look up in CHORD_LOOKUP
 */
Fretboard.showChord = function (name) {
  let spec = Fretboard.CHORD_LOOKUP[name];
  if (spec === undefined) {
    const parts = name.match(/^([A-G][b#]?)(.*)$/);
    const equivalentRoot = parts && Fretboard.ENHARMONIC_ROOTS[parts[1]];
    if (equivalentRoot) {
      spec = Fretboard.CHORD_LOOKUP[equivalentRoot + parts[2]];
    }
  }
  spec = spec ?? "";
  const positions = typeof spec === "string" ? spec : spec.strings;
  const barre = typeof spec === "object" ? spec.barre : null;

  const fresh = $("#fretboard-template").clone();
  fresh.attr("id", "");
  fresh.find(".chord-name").text(name);

  if (positions === "") {
    fresh.find(".unknown").show();
  }

  if (barre) {
    const { _CX, _CY, _R } = Fretboard;
    const x = _CX[barre.fret] - _R;
    const y = Math.min(_CY[barre.from], _CY[barre.to]) - _R;
    const h = Math.abs(_CY[barre.to] - _CY[barre.from]) + 2 * _R;
    const barreEl = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "rect",
    );
    $(barreEl).attr({
      x,
      y,
      width: 2 * _R,
      height: h,
      rx: _R,
      fill: "var(--primary)",
      stroke: "currentColor",
      "stroke-width": "2px",
    });
    fresh.find("svg g.fretboard-base").after(barreEl);
  }

  Array.from(positions).forEach((char, index) => {
    const stringNum = index + 1;
    if (char === "x") {
      fresh.find(`g.string-${stringNum} > .mute`).show();
    } else if (char === "0") {
      fresh.find(`g.string-${stringNum} > .open`).show();
    } else {
      const fretNum = parseInt(char);
      const coveredByBarre =
        barre &&
        fretNum === barre.fret &&
        stringNum >= barre.from &&
        stringNum <= barre.to;
      if (!coveredByBarre) {
        fresh.find(`g.string-${stringNum} > .fret-${char}`).show();
      }
    }
  });

  $("#fretboards").append(fresh);
  fresh.show();
};

/** Remove all rendered Fretboard Chord Diagrams. */
Fretboard.clearChords = function () {
  $("#fretboards").empty();
};
