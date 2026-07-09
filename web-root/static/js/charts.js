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

/** URL query param that names the chart to load (for sharing). */
Charts.SHARE_PARAM = "chart";

/**
 * Stable, shareable slug for a chart, derived from its filename.
 * "../charts/Im-Yours.md" -> "Im-Yours"
 * @param {number} index index into window.charts
 * @returns {string} slug, or "" if index is invalid
 */
Charts.chartSlug = function (index) {
  const chart = charts[index];
  if (!chart) return "";
  const file = (chart.path || "").split("/").pop() || "";
  return file.replace(/\.md$/i, "");
};

/**
 * @param {string} slug
 * @returns {number} matching chart index, or NO_CHART_INDEX if none
 */
Charts.findChartBySlug = function (slug) {
  if (!slug) return Charts.NO_CHART_INDEX;
  const target = slug.toLowerCase();
  const index = charts.findIndex(
    (_, i) => Charts.chartSlug(i).toLowerCase() === target,
  );
  return index === -1 ? Charts.NO_CHART_INDEX : index;
};

/**
 * Reflect the loaded chart in the URL (?chart=<slug>) without a reload, so the
 * address bar is always a shareable deep link.
 * @param {number} index index into window.charts
 */
Charts.updateShareUrl = function (index) {
  const slug = Charts.chartSlug(index);
  const url = new URL(window.location.href);
  if (slug) {
    url.searchParams.set(Charts.SHARE_PARAM, slug);
  } else {
    url.searchParams.delete(Charts.SHARE_PARAM);
  }
  window.history.replaceState(null, "", url);
};

/** Mutable runtime state shared across modules. */
Charts.state = {
  songIndex: 0,
  currentCapo: 0,
  currentDefaultCapo: 0, // chart's built-in capo, set on each render
  currentSongTitle: "", // capo-store key for the current song
  currentSongArtist: "", // artist of the current song (for sharing)
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
  $("#capo-reset span").text(def === 0 ? "None" : "Fret " + def + "");
  // Shown only when a saved override actually differs from the default
  const saved = Charts.getSavedCapo(Charts.state.currentSongTitle);
  $("#capo-reset").prop("disabled", !(saved != null && saved !== def));
};

/** Update the capo display text + up/down enabled state. */
Charts.updateCapoDisplay = function () {
  const capo = Charts.state.currentCapo;
  $("#capo-display").text(capo === 0 ? "None" : "Fret " + capo);
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

/**
 * Shareable deep link for the current chart: current URL with the chart param
 * set and any transient OAuth params stripped.
 * @returns {string} absolute URL
 */
Charts.shareUrl = function () {
  const url = new URL(window.location.href);
  const slug = Charts.chartSlug(Charts.state.songIndex);
  if (slug) url.searchParams.set(Charts.SHARE_PARAM, slug);
  ["code", "state"].forEach((p) => url.searchParams.delete(p));
  return url.toString();
};

/**
 * Share the current chart via the Web Share API. No-op (and the button is
 * hidden at boot) on browsers without navigator.share.
 */
Charts.shareCurrentChart = function () {
  if (!navigator.share) return;
  const title = Charts.state.currentSongTitle;
  const artist = Charts.state.currentSongArtist;
  const label = title
    ? `${title}${artist ? " by " + artist : ""}`
    : "this Song Chart";
  const data = {
    title: `Play along to ${label} on Guitar Chords!`,
    text: `Play along to ${label} on Guitar Chords!`,
    url: Charts.shareUrl(),
  };
  // Abort/permission errors are expected when the user dismisses the sheet.
  navigator.share(data).catch(() => {});
};

/* ------------------------------------------------------------------ */
/* Song loading + rendering                                            */
/* ------------------------------------------------------------------ */

/**
 * Load a chart by index: fetch (and cache) its ChordPro source if needed,
 * then render, scroll to top, and update the heading.
 * @param {number} index index into window.charts
 * @param {object} [opts]
 * @param {string} [opts.spotifyIdent=""] passed through to renderSongChart
 * @param {boolean} [opts.scrollTop=true] animate content scroll back to top
 */
Charts.loadSong = async function (
  index,
  { spotifyIdent = "", scrollTop = true } = {},
) {
  Charts.state.songIndex = index;
  $("#chart-index").text(index + 1);
  $("#charts-available").text(charts.length);

  if (!charts[index].chordProChart) {
    try {
      const res = await fetch(charts[index].path);
      charts[index].chordProChart = res.ok ? await res.text() : "";
    } catch (_) {
      charts[index].chordProChart = "";
    }
  }

  Charts.renderSongChart(charts[index].chordProChart, spotifyIdent);
  if (scrollTop) {
    $("#content").animate({ scrollTop: 0 }, 10);
  }
  $("#heading-title").text(charts[index].name);
  Charts.updateShareUrl(index);
};

/**
 * Parse, transpose (by capo) and render a ChordPro chart into the DOM.
 * @param {string} chartproStr raw ChordPro source
 * @param {string} [spotifyIdent=""] identifier stored in #spotify-ident
 * @param {number} [capoFret=-1] requested capo; -1 = use saved override/default
 */
Charts.renderSongChart = function (
  chartproStr,
  spotifyIdent = "",
  capoFret = -1,
) {
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

  // Skip the no-op transpose: ChordSheetJS respells chords to the song key's
  // modifier even at delta 0 (e.g. Bm -> Cbm in Ab), which would leak into
  // currentlyShownChart.
  const capoDelta = originalCapo - selectedCapo;
  if (capoDelta !== 0) {
    song = song.transpose(capoDelta);
  }

  // normalizeChordSuffix:false keeps written suffixes intact (e.g. "Dsus2"
  // stays "Dsus2" instead of the default normalization to "D2").
  const formatter = new ChordSheetJS.HtmlDivFormatter({
    normalizeChordSuffix: false,
  });
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

  const songTitle = song.metadata.get("title") || "";
  const songArtist = song.metadata.get("artist") || "";
  Charts.state.currentSongArtist = songArtist;
  $("#song-title").text(songTitle);
  $("#song-artist").text(songArtist);
  document.title = songTitle
    ? `${songTitle}${songArtist ? " by " + songArtist : ""} | Guitar Charts`
    : "Guitar Charts";
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

  // Build Fretboard Chord Diagrams from the rendered chart rather than
  // song.getChords(): the two can disagree on enharmonic spelling (e.g. the
  // chart shows Dbm while getChords() returns C#m), and the diagrams must
  // match what the chart displays.
  Fretboard.clearChords();
  const shownChords = new Set();
  $("#song .chord").each(function () {
    const chordName = $(this).text().trim();
    if (chordName && !shownChords.has(chordName)) {
      shownChords.add(chordName);
      Fretboard.showChord(chordName);
    }
  });

  Charts.updateManualButtonStates();

  // Chords render at width:0 and overflow their column (see .chord CSS) so a
  // long chord does not stretch the lyric beneath it. That can let two chords
  // visually collide; nudge them apart once layout + fonts are ready.
  requestAnimationFrame(() => Charts.avoidChordCollisions());
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => Charts.avoidChordCollisions());
  }
};

/**
 * Keep a minimum horizontal gap between adjacent chords in each row.
 *
 * Chords are laid out at width:0 with overflow:visible, so their DOM box does
 * not report the real glyph extent — getBoundingClientRect() gives the (empty)
 * border box. scrollWidth includes the overflowing text, so the true span is
 * [rect.left, rect.left + scrollWidth]. When a chord starts before the previous
 * chord's right edge + MIN_GAP, push its column right via margin-left, which
 * (rows are flex/nowrap) shifts that column and every column after it, so the
 * chord stays aligned over its own lyric. Idempotent: prior nudges are reset
 * first, so it is safe to call on every render and again on fonts.ready.
 */
Charts.avoidChordCollisions = function () {
  const MIN_GAP = 6; // px

  const measure = (chord) => {
    const left = chord.getBoundingClientRect().left;
    return { left, right: left + chord.scrollWidth };
  };

  // Reset any margins from a previous pass before measuring.
  document.querySelectorAll("#song .column").forEach((col) => {
    col.style.marginLeft = "";
  });

  document.querySelectorAll("#song .row").forEach((row) => {
    const chords = Array.from(row.querySelectorAll(".chord")).filter(
      (c) => c.textContent.trim() !== "",
    );
    let prevRight = -Infinity;
    chords.forEach((chord) => {
      let span = measure(chord);
      if (span.left < prevRight + MIN_GAP) {
        const delta = prevRight + MIN_GAP - span.left;
        const col = chord.closest(".column");
        const cur = parseFloat(col.style.marginLeft) || 0;
        col.style.marginLeft = cur + delta + "px";
        span = measure(chord); // re-read after the shift
      }
      prevRight = span.right;
    });
  });
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
