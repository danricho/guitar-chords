/**
 * app.js — top-level UI: theme, scaling, sidebar, song list, event wiring,
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
  const panel = document.getElementById("fretboard-panel");
  document.documentElement.style.setProperty(
    "--panel-width",
    panel.offsetWidth + "px",
  );
  document.documentElement.style.setProperty(
    "--panel-height",
    panel.offsetHeight + "px",
  );
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
/* Song list (sidebar)                                                 */
/* ------------------------------------------------------------------ */

/** Song list categories, in tab order (see #songlist-tabs in index.html). */
App.SONG_CATEGORIES = [
  { name: "Likes", target: "#song-list-likes", tab: "#songlist-tabs-tab-1" },
  {
    name: "Training",
    target: "#song-list-training",
    tab: "#songlist-tabs-tab-2",
  },
  {
    name: "Creating",
    target: "#song-list-creating",
    tab: "#songlist-tabs-tab-3",
  },
];

/**
 * Build one category's song list (registry order preserved).
 * @param {{chart: object, index: number}[]} entries charts with their
 *        window.charts index (kept as data-chart-index for loading)
 * @returns {string} the <ul> html
 */
App.buildSongListHtml = function (entries) {
  if (!entries.length) {
    return `<p class="text-[var(--color-muted-foreground)] px-3 py-1"><em>No songs in this category yet.</em></p>`;
  }

  // The <ul> is a grid and each row's button subgrids onto it, so the
  // chord/difficulty/capo badge columns align across songs (max-content
  // tracks resolve against the whole list). Badges must stay direct children
  // of the button. Below sm the chord group is hidden and its track dropped.
  let html = `<ul class="grid grid-cols-[1fr_max-content_max-content_min-content] sm:grid-cols-[1fr_max-content_max-content_max-content_min-content] gap-y-1">`;

  let prevCapo = null;
  entries.forEach(({ chart, index }, row) => {
    const capo = chart.defaultCapo ?? 0;
    const capoLabel = capo == 0 ? "No Capo" : `Capo ${capo}`;
    // Zebra stripe every second row; small break where the default capo
    // changes (the registry is grouped by capo).
    const zebra = row % 2 ? "bg-[var(--color-muted)]/40" : "";
    const capoBreak = prevCapo !== null && capo !== prevCapo ? "mt-5" : "";
    prevCapo = capo;
    html += `
      <li class="contents">
        <button
          class="col-span-full grid grid-cols-subgrid gap-x-2 items-center text-left px-3 py-1 rounded-md cursor-pointer ${zebra} ${capoBreak}"
          data-chart-index="${index}"
        >
          <span>${chart.title} <small class="italic"> - ${chart.artist}</small></span>`;

    html += `<span class="badge-group inline-flex max-sm:hidden justify-self-end">`;
    chart.chords.forEach((chord) => {
      html += `<span class="badge outline">${chord}</span>`;
    });
    html += `</span>`;

    const difficulty = chart.difficulty || "TBD";
    const trafficClass = chart.difficulty
      ? Charts.DIFFICULTY_CLASSES[chart.difficulty.toLowerCase()] || ""
      : "";
    html += `<span class="badge capitalize outline ps-1 justify-self-center ${trafficClass}"><svg viewBox="0 0 3 6" height="1rem" class="animate-pulse"><circle r="1.5" cx="1.5" cy="3"></circle></svg> ${difficulty}</span>`;

    html += `<span class="badge capitalize outline justify-self-center">${capoLabel}</span>`;

    html += `
          <svg class="size-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <path stroke="currentColor" stroke-linecap="round" stroke-width="2" d="M9 5l7 7-7 7"/>
          </svg>
        </button>
      </li>
    `;
  });

  html += `</ul>`;
  return html;
};

/** Fill each category tab of the Song List (see App.SONG_CATEGORIES). */
App.createSongList = function () {
  App.SONG_CATEGORIES.forEach(({ name, target }) => {
    const entries = charts
      .map((chart, index) => ({ chart, index }))
      .filter(
        ({ chart }) =>
          (chart.category || App.SONG_CATEGORIES[0].name) === name,
      );
    $(target).html(App.buildSongListHtml(entries));
  });
};

/** Switch the Song List to the tab holding the currently-loaded song. */
App.showCurrentSongTab = function () {
  const chart = charts[Charts.state.songIndex];
  if (!chart) return;
  const category = chart.category || App.SONG_CATEGORIES[0].name;
  const entry = App.SONG_CATEGORIES.find((c) => c.name === category);
  if (entry) $(entry.tab).trigger("click");
};

/** Flag the currently-loaded song's button in the song list (for bolding). */
App.markCurrentSong = function () {
  const buttons = document.querySelectorAll(
    "#song-list-content [data-chart-index]",
  );
  buttons.forEach((btn) => {
    btn.classList.toggle(
      "current-song",
      Number(btn.dataset.chartIndex) === Charts.state.songIndex,
    );
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
  // Web Share API only — hide the button where it is unsupported.
  if (navigator.share) {
    $("#share-chart").on("click", Charts.shareCurrentChart);
  } else {
    $("#share-chart").addClass("hidden");
  }
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
  $("#capo-change-skip").on("click", Spotify.next);
  $("#spotify-enable").on("click", Spotify.start);
  $("#spotify-disable").on("click", Spotify.stop);

  // Layout / navigation
  $("#panel-button").on("click", () => App.togglePanel());
  $("#open-songlist-btn, #no-chart-songlist-btn").on("click", () => {
    App.markCurrentSong();
    App.showCurrentSongTab();
    songlist.showModal();
    document.activeElement?.blur(); // drop autofocus glow on first item
  });
  $("#open-settings-btn").on("click", () => {
    settings.showModal();
    document.activeElement?.blur(); // drop autofocus glow on first tab
  });
  $("#logo-pane").on("click", () =>
    window.open("https://github.com/danricho/guitar-chords", "_blank"),
  );

  // Dialog backdrop close
  ["settings", "songlist"].forEach((id) => {
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
    }
  });

  // Delegated sidebar song selection (survives song-list re-renders)
  document
    .getElementById("song-list-content")
    .addEventListener("click", (e) => {
      const btn = e.target.closest("[data-chart-index]");
      if (!btn) return;
      Charts.loadSong(Number(btn.dataset.chartIndex));
      songlist.close();
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

  App.createSongList();
  Charts.bindControls();
  Spotify.applyConfigVisibility();
  App.bindEvents();

  // Restore sidebar state
  App.togglePanel(Store.get("ui_sidebar_open") === "true");

  // Continue Spotify startup after an OAuth redirect
  const code = new URLSearchParams(window.location.search).get("code");
  if (code) Spotify.start();

  // Load the shared chart (?chart=<slug>) if present, else the first chart
  const shareSlug = new URLSearchParams(window.location.search).get(
    Charts.SHARE_PARAM,
  );
  const shareIndex = Charts.findChartBySlug(shareSlug);
  Charts.loadSong(shareIndex !== Charts.NO_CHART_INDEX ? shareIndex : 0);

  // Keep --panel-width in sync whenever Fretboard Chord Diagrams are added or removed
  new MutationObserver(() => requestAnimationFrame(App.syncPanelSize)).observe(
    document.getElementById("fretboards"),
    { childList: true },
  );

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
