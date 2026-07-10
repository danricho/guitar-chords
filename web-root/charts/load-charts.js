/**
 * load-charts.js — the chart registry (edit this to add songs).
 *
 * Exposes: window.charts — array of { spotifyMatch, title, artist, difficulty, chords, heardKey, path, defaultCapo }.
 * Each entry's `.chordProChart` is fetched and cached on first load by Charts.loadSong().
 */

window.charts = [
  // spotifyMatch should match the spotify naming. title/artist/heardKey/defaultCapo
  // are the source of truth (the .md files carry no title/artist/key/capo metadata).
  {
    spotifyMatch: "Lanterns in the Rain - DanRicho feat. AI",
    title: "Lanterns in the Rain",
    artist: "DanRicho feat. AI",
    difficulty: "easy",
    chords: ["G", "D", "Em", "C"],
    heardKey: "G",
    path: "../charts/Fiction-LanternsInTheRain.md",
    defaultCapo: 0,
  },
];
