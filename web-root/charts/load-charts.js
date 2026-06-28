/**
 * load-charts.js — the chart registry (edit this to add songs) plus a
 * synchronous loader that inlines each chart's ChordPro source.
 *
 * Exposes: window.charts — array of { name, path, defaultCapo }; each entry
 * gains a `.chordProChart` string after this file runs.
 */

window.charts = [
  // name should match the spotify naming. The naming in the ChartPro markdown is used in title
  {
    name: "Lanterns in the Rain - DanRicho feat. ChatGPT",
    path: "../charts/Fiction-LanternsInTheRain.md",
    defaultCapo: 0,
  },
];

// Inline each chart's ChordPro source synchronously so it's ready before the
// other scripts run. Wrapped to keep the loader out of global scope.
(function loadCharts() {
  /** Synchronously fetch a text file, returning "" on failure. */
  function loadTextFile(path) {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", path, false); // false = synchronous
    xhr.send();
    return xhr.status === 200 ? xhr.responseText : "";
  }

  window.charts.forEach((chart) => {
    chart.chordProChart = loadTextFile(chart.path);
  });
})();
