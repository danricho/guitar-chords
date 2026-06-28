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
  const MIN = 80; // adjust as you like
  const MAX = 200; // adjust as you like

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
    // document.documentElement.style.fontSize = value + "%";
    document.documentElement.style.setProperty("--current-scale", value);
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

function toggleSpotifyAutoConnect() {
  const enabled = localStorage.getItem("spotify_autoconnect") !== "on";
  localStorage.setItem("spotify_autoconnect", enabled ? "on" : "off");
  spotifyAutoConnect.checked = enabled;
}

function loadChart(index) {
  song_index = index;
  $("#chart-index").text(song_index + 1);
  renderSongChart(charts[song_index].chordProChart);
  $("#content").animate({ scrollTop: 0 }, 10);
}

function createChartList() {
  const grouped = {};
  charts.forEach((chart, index) => {
    const capo = chart.defaultCapo ?? 0;
    if (!grouped[capo]) {
      grouped[capo] = [];
    }
    grouped[capo].push({ chart, index });
  });

  let html = `<section class="accordion">`;

  Object.keys(grouped)
    .sort((a, b) => Number(a) - Number(b))
    .forEach((capo) => {
      html += `
      <details
        class="group border-b last:border-b-0"
      >
        <summary
          class="w-full
                transition-all
                outline-none
                rounded-md"
        >
          <h2
            class="flex flex-1 items-center justify-between
                  gap-4 py-2 text-left"
          >
            <span style='color: var(--primary);'>
              ${capo == 0 ? "No Capo" : `Capo ${capo}`}
            </span>

            <div class="flex items-center gap-2">
              <span class="badge-secondary">
                ${grouped[capo].length}
              </span>

              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="size-4 shrink-0 transition-transform duration-200 group-open:rotate-180"
              >
                <path d="m6 9 6 6 6-6"/>
              </svg>
            </div>
          </h2>
        </summary>

        <section class="pb-4
                border-t">
          <ul class="space-y-1">
      `;

      grouped[capo].forEach(({ chart, index }) => {
        const active = index === song_index;

        html += `
          <li>
            <button
              class="
                w-full
                flex
                items-center
                justify-between
                text-left
                px-3
                py-1
                rounded-md
                cursor-pointer
              "
              onclick="loadChart(${index}); chartlist.close();"
            >
              <span>${chart.name}</span>

              <svg
                class="size-4"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <path
                  stroke="currentColor"
                  stroke-linecap="round"
                  stroke-width="2"
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          </li>
        `;
      });

      html += `
          </ul>
        </section>
      </details>
    `;
    });
  html += `</section>`;

  $("#chart-list-content").html(html);
  const accordion = document.querySelector("#chart-list-content .accordion");

  accordion?.addEventListener("click", (event) => {
    const summary = event.target.closest("summary");
    if (!summary) return;

    const details = summary.closest("details");

    accordion.querySelectorAll("details").forEach((el) => {
      if (el !== details) {
        el.removeAttribute("open");
      }
    });
  });
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

// iOS Safari leaves touch hit-test targets offset from rendered buttons after
// a rotation; only a full reload recomputes them. Reload on orientation change.
window.addEventListener("orientationchange", () => location.reload());

const RELOAD_AFTER_MS = 60 * 60 * 1000;
let lastVisible = Date.now();

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    lastVisible = Date.now();
  } else if (Date.now() - lastVisible > RELOAD_AFTER_MS) {
    location.reload();
  }
});

$(document).ready(function () {
  themeChanger();
  scaleChanger();
  updateViewportSize();
  updateSpotifyUserDisplay();
  spotifyAutoConnect.checked =
    localStorage.getItem("spotify_autoconnect") === "on";
  createChartList();

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

  // auto-connect to spotify on load if enabled in settings
  if (localStorage.getItem("spotify_autoconnect") === "on") {
    start_spotify();
  }

  console.table(
    Object.keys(localStorage)
      .sort()
      .reduce((obj, key) => {
        obj[key] = localStorage.getItem(key);
        return obj;
      }, {}),
  );
});
