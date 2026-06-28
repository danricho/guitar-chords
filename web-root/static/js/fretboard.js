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
Fretboard.CHORD_LOOKUP = {
  A: "x02220",
  A7: "x02020",
  Am: "x02210",
  Am7: "x02010",
  Ab5: "xxx144",
  Abm: "xx110x",
  B: "x24442",
  Bm: "xx0432",
  B7: "x21202",
  Bb: "xx3331",
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
  F: "133211",
  "F#": "244322",
  "F#m": "xxx222",
  Fmaj7: "xx3210",
  G: "320003",
  G6: "xx0000",
  G7: "320001",
  "": "",
};

/**
 * Clone the fretboard template and render the given chord into #fretboards.
 * @param {string} name chord name to look up in CHORD_LOOKUP
 */
Fretboard.showChord = function (name) {
  const positions = Fretboard.CHORD_LOOKUP[name] ?? "";

  const fresh = $("#fretboard-template").clone();
  fresh.attr("id", "");
  fresh.find(".chord-name").text(name);

  if (positions === "") {
    fresh.find(".unknown").show();
  }

  Array.from(positions).forEach((char, index) => {
    if (char === "x") {
      fresh.find(`g.string-${index + 1} > .mute`).show();
    } else if (char === "0") {
      fresh.find(`g.string-${index + 1} > .open`).show();
    } else {
      fresh.find(`g.string-${index + 1} > .fret-${char}`).show();
    }
  });

  $("#fretboards").append(fresh);
  fresh.show();
};

/** Remove all rendered chord diagrams. */
Fretboard.clearChords = function () {
  $("#fretboards").empty();
};
