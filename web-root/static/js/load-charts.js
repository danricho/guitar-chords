/**
 * load-charts.js — loads the chart registry from charts/!registry.json and
 * exposes it as window.charts[] (edit that file to add songs).
 *
 * Fetched with a synchronous XHR (not async fetch()) because every module
 * loaded after this script tag assumes window.charts is already populated —
 * see the JS Module Load Order in CLAUDE.md.
 *
 * Exposes: window.charts — array of { spotifyMatch, title, artist, difficulty, category, chords, heardKey, path, defaultCapo }.
 * Each entry's `.chordProChart` is fetched and cached on first load by Charts.loadSong().
 */

(function () {
  const xhr = new XMLHttpRequest();
  xhr.open("GET", "charts/!registry.json", false);
  xhr.send(null);
  window.charts = JSON.parse(xhr.responseText).charts;
})();
