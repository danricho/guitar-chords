/**
 * sonos.js — Sonos local-network sync: polling loop, scroll-sync, transport
 * controls. A swap-in alternative to spotify.js, not a wrapper around it —
 * deliberately fully independent (see ROADMAP.md "Architecture: kept fully
 * separate"). spotify.js is never modified by this file; it only calls
 * Spotify's existing public Spotify.stop() when Sonos mode is switched on,
 * the same way a user clicking "Disable" would.
 *
 * Depends on: Store, Charts, Fretboard, Scroll, App.state, jQuery.
 * Exposes: window.Sonos
 */

window.Sonos = window.Sonos || {};

Sonos.SPEAKERS = {
  upstairs: "Upstairs",
  downstairs: "Downstairs",
};
Sonos.DEFAULT_SPEAKER = "downstairs";

/** Live playback/sync state. */
Sonos.sync = {
  speaker: Store.get("sonos_speaker") || Sonos.DEFAULT_SPEAKER,
  duration: 0,
  position: 0,
  lastUpdateTime: 0,
  isPlaying: false,
  percent: 0,
  stopSonosMode: 1,
};

/** Last album-art path rendered (avoids redundant <img> swaps). */
Sonos._currentAlbumArtPath = null;

/** Registry index shown as "up next" on the capo-change display (-1 = none). */
Sonos.capoChangeNextIndex = -1;

/* ------------------------------------------------------------------ */
/* Low-level request helpers                                           */
/* ------------------------------------------------------------------ */

/**
 * Request to the local Sonos proxy (see sonos-proxy/server.js), scoped to
 * the currently-selected speaker unless overridden.
 * @param {string} path e.g. "/status", "/play"
 * @param {object} [opts]
 * @param {string} [opts.method="GET"]
 * @param {string} [opts.speaker=Sonos.sync.speaker]
 * @returns {Promise<Response>}
 */
Sonos.apiRequest = function (
  path,
  { method = "GET", speaker = Sonos.sync.speaker } = {},
) {
  const sep = path.includes("?") ? "&" : "?";
  return fetch(
    `/api/sonos${path}${sep}speaker=${encodeURIComponent(speaker)}`,
    { method },
  );
};

/* ------------------------------------------------------------------ */
/* Playback polling + scroll sync                                      */
/* ------------------------------------------------------------------ */

/** Poll the speaker state once and reflect it into the UI. */
Sonos.fetchState = async function () {
  let res;
  try {
    res = await Sonos.apiRequest("/status");
  } catch (_) {
    res = null;
  }
  if (Sonos.sync.stopSonosMode) return;

  let data = null;
  if (res && res.ok) {
    try {
      data = await res.json();
    } catch (_) {
      data = null;
    }
  }

  const isUnavailable =
    !res ||
    !res.ok ||
    !data ||
    !data.title ||
    data.transportState === "STOPPED" ||
    data.transportState === "NO_MEDIA_PRESENT";

  if (isUnavailable) {
    console.log(
      "No active Sonos track (speaker unreachable or nothing playing).",
    );
    $("#spotify-no-player").show();
    $(`
      #albumArt,
      #chart-timesynced,
      .sonos-controls
    `).hide();
    $(".manual-nav-buttons").show();
    $("#song").css({ "padding-bottom": "2rem", "padding-top": "2rem" });
    if (Charts.state.songIndex === Charts.NO_CHART_INDEX) {
      Charts.loadSong(0);
    }
    return;
  }
  $("#spotify-no-player").hide();
  $(`
    #albumArt,
    .sonos-controls
  `).show();
  $(".manual-nav-buttons").hide();
  $("#song").css({ "padding-bottom": "50vh", "padding-top": "50vh" });

  const sync = Sonos.sync;
  const prevLabel = sync.name ? sync.name + " - " + sync.artist : "";
  const prevPercent = sync.percent || 0;
  sync.duration = data.durationMs;
  sync.position = data.positionMs;
  sync.name = data.title;
  sync.artist = data.artist;
  sync.isPlaying = data.isPlaying;
  sync.lastUpdateTime = performance.now();
  sync.percent = data.durationMs
    ? (data.positionMs / data.durationMs) * 100
    : 0;

  $("#sonos-device").text(
    `Sonos: ${Sonos.SPEAKERS[sync.speaker] || sync.speaker}`,
  );
  $("#sonos-song-match").text(`${data.title} - ${data.artist}`);

  $("#sonos-pause").toggle(sync.isPlaying);
  $("#sonos-play").toggle(!sync.isPlaying);

  const songLabel = data.title + " - " + data.artist;
  const index = charts.findIndex((song) => song.spotifyMatch == songLabel);

  if (index === Charts.NO_CHART_INDEX) {
    // No chart for the playing track — same "capo change" / "no chart"
    // static displays Spotify mode uses; this screen is provider-agnostic.
    Charts.state.songIndex = Charts.NO_CHART_INDEX;
    const isCapoChange = data.spotifyTrackId == SpotifyConfig.capoChangeSong;
    if (isCapoChange) {
      if (prevLabel !== songLabel) {
        const last = Charts.state.lastSongIndex;
        let next = last >= 0 ? last + 1 : -1;
        if (last >= 0) {
          const finished = prevPercent > 90;
          const firstOfGroup =
            last === 0 ||
            (charts[last - 1].defaultCapo ?? 0) !==
              (charts[last].defaultCapo ?? 0);
          if (!finished && firstOfGroup) next = last;
        }
        Sonos.capoChangeNextIndex = next;
      }
      const nextChart =
        Sonos.capoChangeNextIndex >= 0
          ? charts[Sonos.capoChangeNextIndex]
          : undefined;
      if (nextChart) {
        const capo =
          Charts.getSavedCapo(nextChart.title) ?? nextChart.defaultCapo ?? 0;
        $("#capo-change-next-title").text(
          `${nextChart.title} by ${nextChart.artist}`,
        );
        $("#capo-change-next-capo").text(
          capo === 0 ? "No Capo" : "Capo " + capo,
        );
      }
      $("#capo-change-next").toggleClass("hidden", !nextChart);
    } else {
      $("#no-chart-song").text(songLabel);
    }
    $("#capo-change-display").toggleClass("hidden", !isCapoChange);
    $("#no-chart-display").toggleClass("hidden", isCapoChange);
    $("#song").addClass("hidden");
    $("#spotify-ident").text("");
    document.body.classList.remove("panel-open");
    $("#song-info").hide();
    $("#song-info-clone").remove();
    Fretboard.clearChords();
    $("#fretboards").html(
      "<div class='w-full text-center'><em>No Chords</em></div>",
    );
    console.log("No Song Chart for song:", songLabel);
    $("#heading-title").text(songLabel);
  } else if ($("#spotify-ident").text() != charts[index].spotifyMatch) {
    Charts.loadSong(index, { spotifyIdent: charts[index].spotifyMatch });
  }
  /* else: already showing the right chart */

  Sonos.updateAlbumArt(data);
};

/**
 * Swap the album-art image when the track changes.
 * @param {object} state player state from fetchState
 */
Sonos.updateAlbumArt = function (state) {
  const path = state?.albumArtPath;
  if (!path || path === Sonos._currentAlbumArtPath) return;
  Sonos._currentAlbumArtPath = path;
  document.getElementById("albumArt").src = path;
  console.log("Updated shown Album Art (Sonos).");
};

/** The polling loop: fetch state, then sync scroll position. */
Sonos.pollingLoop = async function () {
  await Sonos.fetchState();

  if (Sonos.sync.isPlaying) {
    if ($("#song .event").length) {
      Scroll.toVirtualTimestamp(Sonos.sync.position);
      $("#chart-timesynced").show();
    } else if ($("#song .chord-sheet").length) {
      $("#chart-timesynced").hide();
      const $elem = $("#content");
      const maxScroll = $elem[0].scrollHeight - $elem.outerHeight();
      const scrollTarget =
        maxScroll * (Sonos.sync.percent / 100) + $("#song-info").outerHeight();
      if (App.state.isTabActive) {
        $elem.animate({ scrollTop: scrollTarget }, 750);
      }
    }
  }

  if (Sonos.sync.stopSonosMode) return;
  Sonos.sync.loopTimeOut = setTimeout(Sonos.pollingLoop, 1000);
};

/* ------------------------------------------------------------------ */
/* Lifecycle                                                           */
/* ------------------------------------------------------------------ */

/** Enter Sonos mode: stop Spotify (if running), start polling, swap controls. */
Sonos.start = function () {
  Sonos.sync.stopSonosMode = 0;
  if (window.Spotify) Spotify.stop();
  $(
    ".spotify-controls, #spotify-enable, #spotify-disable, #spotify-playlist-link",
  ).hide();
  $("#sonos-active").show();
  Sonos.pollingLoop();
};

/** Leave Sonos mode: stop polling, restore manual UI. */
Sonos.stop = function () {
  Sonos.sync.stopSonosMode = 1;
  clearTimeout(Sonos.sync.loopTimeOut);
  $(".sonos-controls, #sonos-active").hide();
  $("#spotify-no-player").hide();
  // Delegate restoring the idle state to Spotify's own stop() (safe to call
  // even though Spotify was never actually running) — it already knows how
  // to correctly reset #spotify-enable, .manual-nav-buttons, padding, etc.
  // Re-deriving that here by hand is exactly how #spotify-enable staying
  // hidden after leaving Sonos mode happened the first time.
  if (window.Spotify) Spotify.stop();
  // Re-derive playlist-link visibility from config rather than a blind
  // .show() — it should only reappear if SpotifyConfig.playlist is set.
  // (Spotify.stop() above doesn't touch it, so this still needs doing.)
  if (window.Spotify) Spotify.applyConfigVisibility();
};

/* ------------------------------------------------------------------ */
/* Transport controls                                                  */
/* ------------------------------------------------------------------ */

Sonos.play = () => Sonos.apiRequest("/play", { method: "POST" });
Sonos.pause = () => Sonos.apiRequest("/pause", { method: "POST" });
Sonos.restartTrack = () => Sonos.apiRequest("/restart", { method: "POST" });
Sonos.next = () => Sonos.apiRequest("/next", { method: "POST" });
Sonos.previous = () => Sonos.apiRequest("/previous", { method: "POST" });

/* ------------------------------------------------------------------ */
/* UI wiring — self-contained; app.js/spotify.js are never touched.    */
/* ------------------------------------------------------------------ */

Sonos.bindEvents = function () {
  $("#sonosSpeakerSelect").on("change", function () {
    Sonos.sync.speaker = this.value;
    Store.set("sonos_speaker", this.value);
    if (!Sonos.sync.stopSonosMode) Sonos.fetchState();
  });

  $("#sonosModeToggle").on("change", function () {
    Store.set("sonos_mode", this.checked ? "on" : "off");
    if (this.checked) {
      Sonos.start();
      // Mutually exclusive with Spotify auto-connect — can't have both.
      if (Store.get("spotify_autoconnect") === "on") {
        Store.set("spotify_autoconnect", "off");
        $("#spotifyAutoConnect").prop("checked", false);
      }
    } else {
      Sonos.stop();
    }
  });

  // Other half of the mutual exclusion — adds to app.js's own
  // #spotifyAutoConnect change handler (App.toggleSpotifyAutoConnect),
  // doesn't replace it. Reads the checkbox's native .checked directly
  // rather than Store, since this listener is bound before app.js's (sonos.js
  // loads first) and would otherwise see Store's pre-toggle value.
  $("#spotifyAutoConnect").on("change", function () {
    if (this.checked && Store.get("sonos_mode") === "on") {
      Store.set("sonos_mode", "off");
      document.getElementById("sonosModeToggle").checked = false;
      Sonos.stop();
    }
  });

  $("#sonos-play").on("click", Sonos.play);
  $("#sonos-pause").on("click", Sonos.pause);
  $("#sonos-restart").on("click", Sonos.restartTrack);
  $("#sonos-prev").on("click", Sonos.previous);
  $("#sonos-next").on("click", Sonos.next);

  // Routed through the settings toggle (rather than calling Sonos.stop()
  // directly) so the Store write + checkbox state stay in sync with it —
  // one source of truth for "is Sonos mode on".
  $("#sonos-active").on("click", () => {
    $("#sonosModeToggle").prop("checked", false).trigger("change");
  });
};

Sonos.init = function () {
  const select = document.getElementById("sonosSpeakerSelect");
  if (select) select.value = Sonos.sync.speaker;

  Sonos.bindEvents();

  const toggle = document.getElementById("sonosModeToggle");
  const wantsOn = Store.get("sonos_mode") === "on";
  if (toggle) toggle.checked = wantsOn;

  // Reconcile stale state — both could be persisted "on" from before mutual
  // exclusion existed. Sonos wins (matches how it already wins at runtime:
  // Sonos.start() is deferred to window "load", after Spotify auto-connect
  // would've already fired during App.init()'s "ready" phase, and stops it).
  if (wantsOn && Store.get("spotify_autoconnect") === "on") {
    Store.set("spotify_autoconnect", "off");
    const spotifyToggle = document.getElementById("spotifyAutoConnect");
    if (spotifyToggle) spotifyToggle.checked = false;
  }

  if (wantsOn) {
    // Deferred to window "load" (fires after "ready", always) rather than
    // called inline here — App.init() (a "ready" handler registered later,
    // in app.js) calls Spotify.applyConfigVisibility() as part of its own
    // boot sequence, which re-shows #spotify-playlist-link unconditionally.
    // Sonos.start()'s hide of that link needs to run after App.init(), not
    // before, regardless of script tag order.
    $(window).on("load", Sonos.start);
  }
};

$(document).ready(Sonos.init);
