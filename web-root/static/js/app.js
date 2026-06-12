// sorts out the dark/light theme, memory, button, default and stuff
const themeSwitch = document.getElementById("themeSwitch");
function themeChanger() {
  if (localStorage.getItem("ui_theme") === "light") {
    document.documentElement.classList.remove("dark");
    themeSwitch.checked = true;
  } else if (localStorage.getItem("ui_theme") === "dark") {
    document.documentElement.classList.add("dark");
    themeSwitch.checked = false;
  }

  document.addEventListener("basecoat:theme", (event) => {
    new_mode = "dark";
    if (document.documentElement.classList.contains("dark")) {
      new_mode = "light";
      document.documentElement.classList.remove("dark");
      themeSwitch.checked = true;
    } else {
      document.documentElement.classList.add("dark");
      themeSwitch.checked = false;
    }

    localStorage.setItem("ui_theme", new_mode);
  });
}

// sorts out the page scaling, memory, button, default and stuff
function scaleChanger() {
  const DEFAULT = 100; // your baseline
  const STEP = 5; // increments/decrements
  const MIN = 60; // adjust as you like
  const MAX = 140; // adjust as you like

  const clamp = (n) => Math.min(MAX, Math.max(MIN, n));

  const readStored = () => {
    try {
      const raw = localStorage.getItem("ui_scale");
      const n = raw == null ? NaN : Number(raw);
      return Number.isFinite(n) ? clamp(n) : DEFAULT;
    } catch (_) {
      return DEFAULT;
    }
  };

  const apply = (pct) => {
    const value = clamp(Math.round(pct)); // keep it clean
    document.documentElement.style.fontSize = value + "%";
    $("#scaling-display").text(value + "%");
    try {
      localStorage.setItem("ui_scale", String(value));
    } catch (_) {}
  };

  // restore on load
  apply(readStored());

  document.addEventListener("basecoat:scale", (event) => {
    const d = event.detail || {};

    // 1) Explicit value: { value: 95 }
    if (typeof d.value === "number" && Number.isFinite(d.value)) {
      apply(d.value);
      return;
    }

    // 2) Step: { step: +5 } or { step: -5 }
    if (typeof d.step === "number" && Number.isFinite(d.step)) {
      apply(readStored() + d.step);
      return;
    }

    // 3) Convenience: { action: 'increase' | 'decrease' }
    if (d.action === "increase") apply(readStored() + STEP);
    else if (d.action === "decrease") apply(readStored() - STEP);
  });
}

function toggleKidFretCover() {
  if (localStorage.getItem("fret_kidmode") === "on") {
    localStorage.setItem("fret_kidmode", "off");
  } else {
    localStorage.setItem("fret_kidmode", "on");
  }
  $(".fret-kid-cover").toggle(localStorage.getItem("fret_kidmode") === "on");
  kidSwitch.checked = localStorage.getItem("fret_kidmode") === "on";
}

function togglePanel(force) {
  const body = document.body;
  if (typeof force === "boolean") {
    body.classList.toggle("panel-open", force);
    localStorage.setItem("ui_sidebar_open", force);
    return;
  }
  body.classList.toggle("panel-open");
  localStorage.setItem("ui_sidebar_open", $(body).hasClass("panel-open"));
}

// Function to measure and print the viewport size
function updateViewportSize() {
  // Get current dimensions
  const width = window.innerWidth;
  const height = window.innerHeight;
  // Inject the dimensions into the HTML elements
  document.getElementById("width").textContent = width;
  document.getElementById("height").textContent = height;
}
// Run the function every time the browser window is resized
window.addEventListener("resize", updateViewportSize);

$(document).ready(function () {
  themeChanger();
  scaleChanger();
  updateViewportSize();
  updateSpotifyUserDisplay();

  // restore sidebar state from storage
  if (localStorage.getItem("ui_sidebar_open") === "true") {
    togglePanel(true);
  } else {
    togglePanel(false);
  }

  // this is needed to continue the starting of spotify post code retrieval
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  if (code) {
    start_spotify();
  }

  // load first song's chart
  song_index = 0;
  $("#chart-index").text(song_index + 1);
  $("#charts-available").text(charts.length);
  renderSongChart(charts[song_index].chordProChart);
  $("#content").animate({ scrollTop: 0 }, 10);
  $("#heading-title").text(charts[song_index].name);

  // development
  // start_spotify();

  // console.table(
  //   Object.keys(localStorage)
  //     .sort()
  //     .reduce((obj, key) => {
  //       obj[key] = localStorage.getItem(key);
  //       return obj;
  //     }, {})
  // );
});
