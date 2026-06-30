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
/* Fretboard — chord diagram rendering                                 */
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
  A7: "x02020",
  Am: "x02210",
  Am7: "x02010",
  Ab5: "xxx144",
  Abm: "xx110x",
  B: { strings: "x24442", barre: { fret: 2, from: 2, to: 6 } },
  Bm: { strings: "x24432", barre: { fret: 2, from: 2, to: 6 } },
  B7: "x21202",
  Bb: { strings: "x13331", barre: { fret: 1, from: 2, to: 6 } },
  Bb5: "x133xx",
  C: "x32010",
  "C#m": "x4x120",
  C5: "xxxx13",
  C7: "x98910",
  D: "xx0232",
  Dm: "xx0231",
  E: "022100",
  E7: "020100",
  Em: "022000",
  Em7: "022033",
  Eb: "xx1343",
  Eb5: "xx134x",
  F: { strings: "133211", barre: { fret: 1, from: 1, to: 6 } },
  "F#": { strings: "244322", barre: { fret: 2, from: 1, to: 6 } },
  "F#m": { strings: "244222", barre: { fret: 2, from: 1, to: 6 } },
  Fmaj7: "xx3210",
  G: "320003",
  G6: "xx0000",
  G7: "320001",
  "": "",
};

// SVG geometry constants matching the fretboard template
Fretboard._CX = { 1: 5.91, 2: 25.91, 3: 45.91, 4: 65.91, 5: 85.91, 6: 105.91 };
Fretboard._CY = { 1: 28.91, 2: 51.91, 3: 74.91, 4: 97.91 };
Fretboard._R = 7;

/**
 * Clone the fretboard template and render the given chord into #fretboards.
 * @param {string} name chord name to look up in CHORD_LOOKUP
 */
Fretboard.showChord = function (name) {
  const spec = Fretboard.CHORD_LOOKUP[name] ?? "";
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
    const x = _CX[barre.from] - _R;
    const y = _CY[barre.fret] - _R;
    const w = _CX[barre.to] - _CX[barre.from] + 2 * _R;
    const barreEl = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "rect",
    );
    $(barreEl).attr({
      x,
      y,
      width: w,
      height: 2 * _R,
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

/** Remove all rendered chord diagrams. */
Fretboard.clearChords = function () {
  $("#fretboards").empty();
};
