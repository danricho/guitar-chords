/**
 * app.js — top-level UI: theme, scaling, sidebar, chart list, event wiring,
 * and the boot sequence. Loaded last; orchestrates every other module.
 *
 * Depends on: Store, Charts, Spotify, jQuery.
 * Exposes: window.App
 */

window.App = window.App || {};

/** Reload if the tab was hidden for longer than this (ms). */
App.RELOAD_AFTER_MS = 60 * 60 * 1000;

/** Cached DOM element references (populated in App.init). */
App.dom = {
  themeSwitch: null,
  kidSwitch: null,
  spotifyAutoConnect: null,
};

/** Cross-module runtime state. */
App.state = {
  isTabActive: true,
  lastVisible: Date.now(),
};

/* ------------------------------------------------------------------ */
/* Theme + scaling                                                     */
/* ------------------------------------------------------------------ */

/** Restore theme from storage and wire the basecoat:theme toggle event. */
App.themeChanger = function () {
  const themeSwitch = App.dom.themeSwitch;

  if (Store.get("ui_theme") === "light") {
    document.documentElement.classList.remove("dark");
    themeSwitch.checked = true;
  } else if (Store.get("ui_theme") === "dark") {
    document.documentElement.classList.add("dark");
    themeSwitch.checked = false;
  }

  document.addEventListener("basecoat:theme", () => {
    let newMode = "dark";
    if (document.documentElement.classList.contains("dark")) {
      newMode = "light";
      document.documentElement.classList.remove("dark");
      themeSwitch.checked = true;
    } else {
      document.documentElement.classList.add("dark");
      themeSwitch.checked = false;
    }
    Store.set("ui_theme", newMode);
  });
};

/** Restore page scale from storage and wire the basecoat:scale event. */
App.scaleChanger = function () {
  const DEFAULT = 100;
  const STEP = 5;
  const MIN = 80;
  const MAX = 200;

  const clamp = (n) => Math.min(MAX, Math.max(MIN, n));

  const readStored = () => {
    const raw = Store.get("ui_scale");
    const n = raw == null ? NaN : Number(raw);
    return Number.isFinite(n) ? clamp(n) : DEFAULT;
  };

  const apply = (pct) => {
    const value = clamp(Math.round(pct));
    document.documentElement.style.setProperty("--current-scale", value);
    $("#scaling-display").text(value + "%");
    Store.set("ui_scale", String(value));
  };

  apply(readStored());

  document.addEventListener("basecoat:scale", (event) => {
    const d = event.detail || {};
    if (typeof d.value === "number" && Number.isFinite(d.value)) {
      apply(d.value);
    } else if (typeof d.step === "number" && Number.isFinite(d.step)) {
      apply(readStored() + d.step);
    } else if (d.action === "increase") {
      apply(readStored() + STEP);
    } else if (d.action === "decrease") {
      apply(readStored() - STEP);
    }
  });
};

/* ------------------------------------------------------------------ */
/* Toggles                                                             */
/* ------------------------------------------------------------------ */

/** Toggle the 3-string fret cover (kid mode) and persist it. */
App.toggleKidFretCover = function () {
  const on = Store.get("fret_kidmode") !== "on";
  Store.set("fret_kidmode", on ? "on" : "off");
  $(".fret-kid-cover").toggle(on);
  App.dom.kidSwitch.checked = on;
};

/** Toggle the Spotify auto-connect-on-load preference and persist it. */
App.toggleSpotifyAutoConnect = function () {
  const enabled = Store.get("spotify_autoconnect") !== "on";
  Store.set("spotify_autoconnect", enabled ? "on" : "off");
  App.dom.spotifyAutoConnect.checked = enabled;
};

/** Measure the panel and sync --panel-width and --panel-height on :root. */
App.syncPanelSize = function () {
  const panel = document.getElementById("fretboard-chart-panel");
  document.documentElement.style.setProperty("--panel-width", panel.offsetWidth + "px");
  document.documentElement.style.setProperty("--panel-height", panel.offsetHeight + "px");
};

/**
 * Toggle (or set) the side panel open state and persist it.
 * @param {boolean} [force] explicit open/closed state; omit to toggle
 */
App.togglePanel = function (force) {
  const body = document.body;
  if (typeof force === "boolean") {
    body.classList.toggle("panel-open", force);
  } else {
    body.classList.toggle("panel-open");
  }
  Store.set("ui_sidebar_open", String(body.classList.contains("panel-open")));
  requestAnimationFrame(App.syncPanelSize);
};

/* ------------------------------------------------------------------ */
/* Viewport readout                                                    */
/* ------------------------------------------------------------------ */

/** Write the current viewport dimensions into the debug readout. */
App.updateViewportSize = function () {
  document.getElementById("width").textContent = window.innerWidth;
  document.getElementById("height").textContent = window.innerHeight;
};

/* ------------------------------------------------------------------ */
/* Chart list (sidebar)                                                */
/* ------------------------------------------------------------------ */

/** Build the grouped-by-capo accordion of available charts. */
App.createChartList = function () {
  const grouped = {};
  charts.forEach((chart, index) => {
    const capo = chart.defaultCapo ?? 0;
    if (!grouped[capo]) grouped[capo] = [];
    grouped[capo].push({ chart, index });
  });

  let html = `<section class="accordion">`;

  Object.keys(grouped)
    .sort((a, b) => Number(a) - Number(b))
    .forEach((capo) => {
      html += `
      <details class="group border-b last:border-b-0">
        <summary class="w-full transition-all outline-none rounded-md">
          <h2 class="flex flex-1 items-center justify-between gap-4 py-2 text-left">
            <span style='color: var(--primary);'>
              ${capo == 0 ? "No Capo" : `Capo ${capo}`}
            </span>
            <div class="flex items-center gap-2">
              <span class="badge-secondary">${grouped[capo].length}</span>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                   class="size-4 shrink-0 transition-transform duration-200 group-open:rotate-180">
                <path d="m6 9 6 6 6-6"/>
              </svg>
            </div>
          </h2>
        </summary>
        <section class="pb-4 border-t">
          <ul class="space-y-1">
      `;

      grouped[capo].forEach(({ chart, index }) => {
        html += `
          <li>
            <button
              class="w-full flex items-center justify-between text-left px-3 py-1 rounded-md cursor-pointer"
              data-chart-index="${index}"
            >
              <span>${chart.name}</span>
              <svg class="size-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <path stroke="currentColor" stroke-linecap="round" stroke-width="2" d="M9 5l7 7-7 7"/>
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

  // Collapse sibling accordions when one opens
  const accordion = document.querySelector("#chart-list-content .accordion");
  accordion?.addEventListener("click", (event) => {
    const summary = event.target.closest("summary");
    if (!summary) return;
    const details = summary.closest("details");
    accordion.querySelectorAll("details").forEach((el) => {
      if (el !== details) el.removeAttribute("open");
    });
  });
};

/* ------------------------------------------------------------------ */
/* Event wiring                                                        */
/* ------------------------------------------------------------------ */

/** Wire every UI control (former inline handlers + delegated handlers). */
App.bindEvents = function () {
  // Settings toggles
  $("#kidSwitch").on("change", App.toggleKidFretCover);
  $("#spotifyAutoConnect").on("change", App.toggleSpotifyAutoConnect);
  $("#themeSwitch").on("change", () =>
    document.dispatchEvent(new CustomEvent("basecoat:theme")),
  );

  // Chart actions
  $("#copy-chart-btn").on("click", Charts.copyCurrentChart);
  $("#reset-capos-btn").on("click", Charts.clearSavedCapos);
  $("#capo-reset").on("click", Charts.restoreDefaultCapo);

  // Spotify settings + transport
  $("#spotify-logout-btn").on("click", Spotify.logout);
  $("#copy-song-match-btn").on("click", () =>
    navigator.clipboard.writeText($("#spotify-song-match span").text()),
  );
  $("#spotify-play").on("click", Spotify.play);
  $("#spotify-pause").on("click", Spotify.pause);
  $("#spotify-song-restart").on("click", Spotify.restartTrack);
  $("#spotify-prev").on("click", Spotify.previous);
  $("#spotify-next").on("click", Spotify.next);
  $("#spotify-enable").on("click", Spotify.start);
  $("#spotify-disable").on("click", Spotify.stop);

  // Layout / navigation
  $("#panel-button").on("click", () => App.togglePanel());
  $("#open-chartlist-btn").on("click", () => chartlist.showModal());
  $("#open-settings-btn").on("click", () => settings.showModal());
  $("#logo-pane").on("click", () =>
    window.open("https://github.com/danricho/guitar-chords", "_blank"),
  );

  // Dialog backdrop close
  ["settings", "chartlist"].forEach((id) => {
    const dlg = document.getElementById(id);
    if (!dlg) return;
    dlg.addEventListener("click", (e) => {
      if (e.target === dlg) dlg.close();
    });
  });

  // Delegated simple window/document actions
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    switch (el.dataset.action) {
      case "close-dialog":
        el.closest("dialog")?.close();
        break;
      case "scale-down":
        document.dispatchEvent(
          new CustomEvent("basecoat:scale", { detail: { step: -5 } }),
        );
        break;
      case "scale-up":
        document.dispatchEvent(
          new CustomEvent("basecoat:scale", { detail: { step: +5 } }),
        );
        break;
      case "scale-reset":
        document.dispatchEvent(
          new CustomEvent("basecoat:scale", { detail: { value: 100 } }),
        );
        break;
      case "reload":
        location.reload();
        break;
      case "clear-storage":
        localStorage.clear();
        location.reload();
        break;
      case "print":
        window.print();
        break;
    }
  });

  // Delegated sidebar song selection (survives chart-list re-renders)
  document
    .getElementById("chart-list-content")
    .addEventListener("click", (e) => {
      const btn = e.target.closest("[data-chart-index]");
      if (!btn) return;
      Charts.loadSong(Number(btn.dataset.chartIndex));
      chartlist.close();
    });
};

/** Wire window/document-level listeners (no DOM-ready needed). */
App.bindWindowEvents = function () {
  window.addEventListener("resize", App.updateViewportSize);

  // iOS Safari leaves touch hit-test targets offset after a rotation; only a
  // full reload recomputes them.
  window.addEventListener("orientationchange", () => location.reload());

  // Safety net: always reveal the page on full load even if init() throws.
  window.addEventListener("load", () =>
    document.body.classList.add("app-ready"),
  );

  // Consolidated visibility handling: track tab-active state (for scroll sync)
  // and reload after a long hidden period.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      App.state.isTabActive = false;
      App.state.lastVisible = Date.now();
    } else {
      App.state.isTabActive = true;
      if (Date.now() - App.state.lastVisible > App.RELOAD_AFTER_MS) {
        location.reload();
      }
    }
  });
};

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

/** Application boot sequence (runs on DOM ready). */
App.init = function () {
  App.dom.themeSwitch = document.getElementById("themeSwitch");
  App.dom.kidSwitch = document.getElementById("kidSwitch");
  App.dom.spotifyAutoConnect = document.getElementById("spotifyAutoConnect");

  App.themeChanger();
  App.scaleChanger();
  App.updateViewportSize();
  Spotify.updateUserDisplay();
  App.dom.spotifyAutoConnect.checked =
    Store.get("spotify_autoconnect") === "on";

  App.createChartList();
  Charts.bindControls();
  Spotify.applyConfigVisibility();
  App.bindEvents();

  // Restore sidebar state
  App.togglePanel(Store.get("ui_sidebar_open") === "true");

  // Continue Spotify startup after an OAuth redirect
  const code = new URLSearchParams(window.location.search).get("code");
  if (code) Spotify.start();

  // Load the first chart
  Charts.loadSong(0);

  // Keep --panel-width in sync whenever chord diagrams are added or removed
  new MutationObserver(() => requestAnimationFrame(App.syncPanelSize))
    .observe(document.getElementById("fretboards"), { childList: true });

  // Auto-connect to Spotify if enabled in settings
  if (Store.get("spotify_autoconnect") === "on") Spotify.start();

  // Reveal the page once the first render + fonts are done (avoids FOUC)
  const reveal = () => document.body.classList.add("app-ready");
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(reveal);
  } else {
    reveal();
  }

  console.table(
    Object.keys(localStorage)
      .sort()
      .reduce((obj, key) => {
        obj[key] = localStorage.getItem(key);
        return obj;
      }, {}),
  );
};

App.bindWindowEvents();
$(document).ready(App.init);
