/**
 * load-charts.js — the chart registry (edit this to add songs).
 *
 * Exposes: window.charts — array of { name, path, defaultCapo }.
 * Each entry's `.chordProChart` is fetched and cached on first load by Charts.loadSong().
 */

window.charts = [
  // name should match the spotify naming. The naming in the ChartPro markdown is used in title
  {
    name: "Lanterns in the Rain - DanRicho feat. ChatGPT",
    path: "../charts/Fiction-LanternsInTheRain.md",
    defaultCapo: 0,
  },
];
