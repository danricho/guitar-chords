/**
 * charts.js — chart rendering, song navigation, and per-song capo state.
 *
 * Depends on: window.charts (load-charts.js), ChordSheetJS, jQuery,
 *             Fretboard, Store.
 * Exposes: window.Charts
 */

window.Charts = window.Charts || {};

/** Sentinel song index meaning "no chart matches the current song". */
Charts.NO_CHART_INDEX = -1;

/** localStorage key for per-song capo overrides (keyed by song title). */
Charts.CAPO_STORE_KEY = "song_capo";

/** Mutable runtime state shared across modules. */
Charts.state = {
  songIndex: 0,
  currentCapo: 0,
  currentDefaultCapo: 0, // chart's built-in capo, set on each render
  currentSongTitle: "", // capo-store key for the current song
  currentlyShownChart: "", // ChordPro of what's on screen (for copy)
};

/* ------------------------------------------------------------------ */
/* Per-song capo persistence                                           */
/* ------------------------------------------------------------------ */

/** @returns {Object<string, number>} the title→capo override map */
Charts.capoStore = function () {
  return Store.getJSON(Charts.CAPO_STORE_KEY, {});
};

/**
 * Persist the current song's capo as an override. If the selected capo equals
 * the chart's default, the override is removed instead (so reselecting the
 * default clears it and hides the restore button).
 */
Charts.saveCurrentCapo = function () {
  if (!Charts.state.currentSongTitle) return;
  const store = Charts.capoStore();
  if (Charts.state.currentCapo === Charts.state.currentDefaultCapo) {
    delete store[Charts.state.currentSongTitle];
  } else {
    store[Charts.state.currentSongTitle] = Charts.state.currentCapo;
  }
  Store.setJSON(Charts.CAPO_STORE_KEY, store);
};

/**
 * @param {string} title
 * @returns {?number} saved capo override, or null if none
 */
Charts.getSavedCapo = function (title) {
  const store = Charts.capoStore();
  return Object.prototype.hasOwnProperty.call(store, title)
    ? store[title]
    : null;
};

/** Wipe ALL capo overrides and re-render the current song at its default. */
Charts.clearSavedCapos = function () {
  Store.remove(Charts.CAPO_STORE_KEY);
  Charts.renderSongChart(
    charts[Charts.state.songIndex].chordProChart,
    $("#spotify-ident").text(),
  );
};

/** Clear only the current song's override and re-render at its default capo. */
Charts.restoreDefaultCapo = function () {
  const store = Charts.capoStore();
  delete store[Charts.state.currentSongTitle];
  Store.setJSON(Charts.CAPO_STORE_KEY, store);
  Charts.renderSongChart(
    charts[Charts.state.songIndex].chordProChart,
    $("#spotify-ident").text(),
  );
};

/* ------------------------------------------------------------------ */
/* Capo / navigation button state                                      */
/* ------------------------------------------------------------------ */

/** Update the "restore default" button label + visibility. */
Charts.updateCapoResetButton = function () {
  const def = Charts.state.currentDefaultCapo;
  $("#capo-reset").text(def === 0 ? "No Capo" : "Fret #" + def);
  // Shown only when a saved override actually differs from the default
  const saved = Charts.getSavedCapo(Charts.state.currentSongTitle);
  $("#capo-reset").toggle(saved != null && saved !== def);
};

/** Update the capo display text + up/down enabled state. */
Charts.updateCapoDisplay = function () {
  const capo = Charts.state.currentCapo;
  $("#capo-display").text(capo === 0 ? "Capo: No Capo" : "Capo: Fret #" + capo);
  $("#capo-down").prop("disabled", capo <= 0);
  $("#capo-up").prop("disabled", capo >= 11);
};

/** Enable/disable prev/next based on the current song index. */
Charts.updateManualButtonStates = function () {
  $("#prev-song").prop("disabled", Charts.state.songIndex <= 0);
  $("#next-song").prop("disabled", Charts.state.songIndex >= charts.length - 1);
};

/** Copy the currently displayed chart's ChordPro to the clipboard. */
Charts.copyCurrentChart = function () {
  navigator.clipboard.writeText(Charts.state.currentlyShownChart);
};

/* ------------------------------------------------------------------ */
/* Song loading + rendering                                            */
/* ------------------------------------------------------------------ */

/**
 * Load a chart by index: update counters, render, scroll to top, set heading.
 * @param {number} index index into window.charts
 * @param {object} [opts]
 * @param {string} [opts.spotifyIdent=""] passed through to renderSongChart
 * @param {boolean} [opts.scrollTop=true] animate content scroll back to top
 */
Charts.loadSong = function (index, { spotifyIdent = "", scrollTop = true } = {}) {
  Charts.state.songIndex = index;
  $("#chart-index").text(index + 1);
  $("#charts-available").text(charts.length);
  Charts.renderSongChart(charts[index].chordProChart, spotifyIdent);
  if (scrollTop) {
    $("#content").animate({ scrollTop: 0 }, 10);
  }
  $("#heading-title").text(charts[index].name);
};

/**
 * Parse, transpose (by capo) and render a ChordPro chart into the DOM.
 * @param {string} chartproStr raw ChordPro source
 * @param {string} [spotifyIdent=""] identifier stored in #spotify-ident
 * @param {number} [capoFret=-1] requested capo; -1 = use saved override/default
 */
Charts.renderSongChart = function (chartproStr, spotifyIdent = "", capoFret = -1) {
  const parser = new ChordSheetJS.ChordProParser();
  let song = parser.parse(chartproStr.trim());

  // Store original (concert) key before any transposition
  const originalKey = song.metadata.get("key");

  // Title is the key for per-song capo persistence
  Charts.state.currentSongTitle = song.metadata.get("title") || "";

  // External link buttons (bound dynamically since the URL is per-song)
  const youtubeUrl = song.metadata.get("youtube");
  if (youtubeUrl) {
    $("#youtube-link")
      .off("click")
      .on("click", () => window.open(youtubeUrl, "_blank"))
      .show();
  } else {
    $("#youtube-link").off("click").hide();
  }

  const spotifyUrl = song.metadata.get("spotify");
  if (spotifyUrl) {
    $("#spotify-link")
      .off("click")
      .on("click", () => window.open(spotifyUrl, "_blank"))
      .show();
  } else {
    $("#spotify-link").off("click").hide();
  }

  // Resolve capo: explicit request, else saved override, else chart default
  const capoMeta = song.metadata.get("capo");
  const originalCapo = Number.isFinite(Number(capoMeta)) ? Number(capoMeta) : 0;

  let selectedCapo = Number.isFinite(Number(capoFret)) ? Number(capoFret) : 0;
  if (selectedCapo === -1) {
    const savedCapo = Charts.getSavedCapo(Charts.state.currentSongTitle);
    selectedCapo = savedCapo != null ? savedCapo : originalCapo;
  }

  Charts.state.currentDefaultCapo = originalCapo;
  Charts.state.currentCapo = selectedCapo;
  Charts.updateCapoDisplay();
  Charts.updateCapoResetButton();

  song = song.transpose(originalCapo - selectedCapo);

  const formatter = new ChordSheetJS.HtmlDivFormatter();
  const html = formatter.format(song);

  const chordProFormatter = new ChordSheetJS.ChordProFormatter();
  Charts.state.currentlyShownChart = chordProFormatter.format(song);

  document.getElementById("song").innerHTML = html;

  // Remove rows whose lyrics are entirely empty
  $("#song .row").each(function () {
    const $lyrics = $(this).find(".lyrics");
    if (
      $lyrics.filter(function () {
        return $.trim($(this).text()) !== "";
      }).length === 0
    ) {
      $lyrics.remove();
    }
  });

  // Remove completely empty rows
  $("#song .row").each(function () {
    const $row = $(this);
    if (
      $row.filter(function () {
        return $.trim($(this).text()) !== "";
      }).length === 0
    ) {
      $row.remove();
    }
  });

  // Convert "MM:SS" comment markers into timestamped .event divs
  const tsRegex = /^(\d{2}):(\d{2})$/;
  $("#song .comment").each(function () {
    const text = $(this).text().trim();
    const match = text.match(tsRegex);
    if (!match) return;
    const minutes = parseInt(match[1], 10);
    const seconds = parseInt(match[2], 10);
    const milliseconds = (minutes * 60 + seconds) * 1000;
    $(this).replaceWith(
      $("<div>", { class: "event", "data-timestamp": milliseconds }),
    );
  });

  $("#song-title").text(song.metadata.get("title") || "");
  $("#song-artist").text(song.metadata.get("artist") || "");
  $("#spotify-ident").text(spotifyIdent);
  $("#song-tempo").text((song.metadata.get("tempo") || "") + " BPM");

  // Concert key (what the audience hears)
  $("#song-key").text(originalKey || "");

  // Capo currently selected by the user
  $("#capo-setting").text(selectedCapo === 0 ? "None" : "Fret " + selectedCapo);

  $("#song-info").show();
  $("#song-info-clone").remove();
  const clone = $("#song-info").clone();
  clone.attr("id", "song-info-clone").attr("class", "").css("opacity", "0");
  $("#main-content").prepend(clone);

  // Reflect kid-mode fret cover state for the freshly rendered chart
  const kidMode = Store.get("fret_kidmode") === "on";
  $(".fret-kid-cover").toggle(kidMode);
  $("#kidSwitch").prop("checked", kidMode);

  Fretboard.clearChords();
  song.getChords().forEach((chord) => Fretboard.showChord(chord));

  Charts.updateManualButtonStates();
};

/* ------------------------------------------------------------------ */
/* Control bindings (called once from App.init)                        */
/* ------------------------------------------------------------------ */

/** Wire the capo and prev/next song buttons. */
Charts.bindControls = function () {
  $("#capo-down").on("click", function () {
    if (Charts.state.currentCapo > 0) {
      Charts.state.currentCapo--;
      Charts.updateCapoDisplay();
      Charts.renderSongChart(
        charts[Charts.state.songIndex].chordProChart,
        $("#spotify-ident").text(),
        Charts.state.currentCapo,
      );
      Charts.saveCurrentCapo();
      Charts.updateCapoResetButton();
    }
  });

  $("#capo-up").on("click", function () {
    if (Charts.state.currentCapo < 11) {
      Charts.state.currentCapo++;
      Charts.updateCapoDisplay();
      Charts.renderSongChart(
        charts[Charts.state.songIndex].chordProChart,
        $("#spotify-ident").text(),
        Charts.state.currentCapo,
      );
      Charts.saveCurrentCapo();
      Charts.updateCapoResetButton();
    }
  });

  $("#prev-song").on("click", function () {
    if (Charts.state.songIndex > 0) {
      Charts.loadSong(Charts.state.songIndex - 1);
    }
  });

  $("#next-song").on("click", function () {
    if (Charts.state.songIndex < charts.length - 1) {
      Charts.loadSong(Charts.state.songIndex + 1);
    }
  });
};
