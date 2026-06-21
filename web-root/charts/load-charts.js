charts = [
  // name should match the spotify naming. The naming in the ChartPro markdown is used in title
  {
    name: "Lanterns in the Rain - DanRicho feat. ChatGPT",
    path: "../charts/Fiction-LanternsInTheRain.md",
  },
];

function loadTextFile(path) {
  var xhr = new XMLHttpRequest();
  xhr.open("GET", path, false); // false = synchronous
  xhr.send();
  if (xhr.status === 200) {
    return xhr.responseText;
  }
  return "";
}

charts.forEach(function (chart) {
  chart.chordProChart = loadTextFile(chart.path);
});
