/**
 * spotify.js — Spotify Web API integration: OAuth (PKCE), playback polling,
 * scroll-sync, and transport controls.
 *
 * Depends on: SpotifyConfig, Charts, Fretboard, Scroll, App.state, jQuery.
 * Exposes: window.Spotify
 */

window.Spotify = window.Spotify || {};

/** Live playback/sync state. */
Spotify.sync = {
  accessToken: null,
  duration: 0,
  position: 0,
  lastUpdateTime: 0,
  isPlaying: false,
  stopSpotifyMode: 1,
};

/** Last album-art track id rendered (avoids redundant <img> swaps). */
Spotify._currentTrackId = null;

/** Registry index shown as "up next" on the capo-change display (-1 = none). */
Spotify.capoChangeNextIndex = -1;

/* ------------------------------------------------------------------ */
/* Low-level request helpers                                           */
/* ------------------------------------------------------------------ */

/**
 * Authenticated request to the Spotify Web API.
 * @param {string} path path under https://api.spotify.com/v1
 * @param {object} [opts]
 * @param {string} [opts.method="GET"]
 * @param {string} [opts.token=Spotify.sync.accessToken] bearer token
 * @returns {Promise<Response>}
 */
Spotify.apiRequest = function (
  path,
  { method = "GET", token = Spotify.sync.accessToken } = {},
) {
  return fetch("https://api.spotify.com/v1" + path, {
    method,
    headers: { Authorization: `Bearer ${token}` },
  });
};

/**
 * Form-POST to the Spotify token endpoint.
 * @param {object} params body fields
 * @returns {Promise<object>} parsed token response
 */
Spotify.tokenRequest = async function (params) {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  return res.json();
};

/* ------------------------------------------------------------------ */
/* Playback polling + scroll sync                                      */
/* ------------------------------------------------------------------ */

/** Poll the player state once and reflect it into the UI. */
Spotify.fetchState = async function () {
  const res = await Spotify.apiRequest("/me/player");
  if (Spotify.sync.stopSpotifyMode) return;

  if (res.status === 204) {
    console.log("No active Spotify player!");
    $("#spotify-no-player").show();
    $(`
      #spotify-text,
      #albumArt,
      #chart-timesynced,
      .spotify-controls
    `).hide();
    // No player → render like Spotify mode is off: no padding, manual nav on.
    $(".manual-nav-buttons").show();
    $("#song").css({ "padding-bottom": "2rem", "padding-top": "2rem" });
    if (Charts.state.songIndex === Charts.NO_CHART_INDEX) {
      Charts.loadSong(0);
    }
    return null;
  }
  $("#spotify-no-player").hide();
  $(`
    #spotify-text,
    #albumArt,
    .spotify-controls
  `).show();
  // Player active → restore synced view: padding + manual nav hidden.
  $(".manual-nav-buttons").hide();
  $("#song").css({ "padding-bottom": "50vh", "padding-top": "50vh" });

  if (!res.ok) return;

  const data = await res.json();
  if (!data || !data.item) return;

  const sync = Spotify.sync;
  // Previous poll's track + progress, captured before sync is overwritten
  // (used to tell forward playback from a back-press on track change).
  const prevLabel = sync.name ? sync.name + " - " + sync.artist : "";
  const prevPercent = sync.percent || 0;
  sync.duration = data.item.duration_ms;
  sync.position = data.progress_ms;
  sync.name = data.item.name;
  sync.artist = data.item.artists[0].name;
  sync.isPlaying = data.is_playing;
  sync.lastUpdateTime = performance.now();
  sync.percent = (data.progress_ms / data.item.duration_ms) * 100;

  $("#spotify-device").text(`Playing on '${data.device.name}'`);
  $("#spotify-song-id").text(`Song ID: ${data.item.id}`);
  $("#spotify-song-match span").text(
    `${data.item.name} - ${data.item.artists[0].name}`,
  );

  $("#spotify-pause").toggle(sync.isPlaying);
  $("#spotify-play").toggle(!sync.isPlaying);

  const songLabel = data.item.name + " - " + data.item.artists[0].name;
  const index = charts.findIndex((song) => song.spotifyMatch == songLabel);

  if (index === Charts.NO_CHART_INDEX) {
    // No chart for the playing track — swap the Song Chart for one of the
    // static displays in index.html (capo-change or no-chart).
    Charts.state.songIndex = Charts.NO_CHART_INDEX;
    const isCapoChange = data.item.id == SpotifyConfig.capoChangeSong;
    if (isCapoChange) {
      // Next song comes from the registry (playlists are assumed to follow
      // load-charts.js order). Decide it once, on arrival at the capo-change
      // track, so later polls of this track don't recompute from stale data.
      if (prevLabel !== songLabel) {
        const last = Charts.state.lastSongIndex;
        let next = last >= 0 ? last + 1 : -1;
        if (last >= 0) {
          // A back-press lands here from the FIRST song of a capo group,
          // leaving it unfinished — that same song will replay after the
          // capo change, so don't look one ahead of it.
          const finished = prevPercent > 90;
          const firstOfGroup =
            last === 0 ||
            (charts[last - 1].defaultCapo ?? 0) !==
              (charts[last].defaultCapo ?? 0);
          if (!finished && firstOfGroup) next = last;
        }
        Spotify.capoChangeNextIndex = next;
      }
      const nextChart =
        Spotify.capoChangeNextIndex >= 0
          ? charts[Spotify.capoChangeNextIndex]
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
    // No chart is on screen any more — clear the ident so returning to the
    // same song (e.g. after a back-press) still triggers a reload.
    $("#spotify-ident").text("");
    // Slide the Fretboard Chord Diagram pane away while no chart is shown.
    // The stored ui_sidebar_open preference is untouched; renderSongChart
    // restores the pane from it when a chart takes over again.
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
    // New matching chart — load it
    Charts.loadSong(index, { spotifyIdent: charts[index].spotifyMatch });
  }
  /* else: already showing the right chart */

  Spotify.updateAlbumArt(data);
};

/**
 * Swap the album-art image when the track changes.
 * @param {object} state player state from fetchState
 */
Spotify.updateAlbumArt = function (state) {
  const trackId = state?.item?.id;
  if (!trackId || trackId === Spotify._currentTrackId) return;
  Spotify._currentTrackId = trackId;
  // image index 0 = 640px, 1 = 300px, 2 = 64px
  document.getElementById("albumArt").src = state.item.album.images[1].url;
  console.log("Updated shown Album Art.");
};

/** The polling loop: fetch state, then sync scroll position. */
Spotify.pollingLoop = async function () {
  await Spotify.fetchState();

  if (Spotify.sync.isPlaying) {
    if ($("#song .event").length) {
      // timesynced chart
      Scroll.toVirtualTimestamp(Spotify.sync.position);
      $("#chart-timesynced").show();
    } else if ($("#song .chord-sheet").length) {
      // percentage-scrolled chart
      $("#chart-timesynced").hide();
      const $elem = $("#content");
      const maxScroll = $elem[0].scrollHeight - $elem.outerHeight();
      const scrollTarget =
        maxScroll * (Spotify.sync.percent / 100) +
        $("#song-info").outerHeight();
      if (App.state.isTabActive) {
        $elem.animate({ scrollTop: scrollTarget }, 1000);
      }
    }
  }

  if (Spotify.sync.stopSpotifyMode) return;
  Spotify.sync.loopTimeOut = setTimeout(Spotify.pollingLoop, 2000);
};

/** Begin polling with the given token. @param {string} accessToken */
Spotify.startScrollSync = function (accessToken) {
  Spotify.sync.accessToken = accessToken;
  Spotify.pollingLoop();
};

/* ------------------------------------------------------------------ */
/* Session + profile                                                   */
/* ------------------------------------------------------------------ */

/** @param {object} session */
Spotify.saveSession = function (session) {
  Store.setJSON("spotify_session", session);
};

/** @returns {?object} */
Spotify.loadSession = function () {
  return Store.getJSON("spotify_session", null);
};

/** @returns {?object} */
Spotify.loadUser = function () {
  return Store.getJSON("spotify_user", null);
};

/** Reflect the connected user (or "Not connected") in the settings dialog. */
Spotify.updateUserDisplay = function () {
  const user = Spotify.loadUser();
  $("#spotify-user").text(
    user ? "Logged in as: " + user.display_name : "Not connected",
  );
};

/**
 * Fetch the user's Spotify profile.
 * @param {string} accessToken
 * @returns {Promise<?object>}
 */
Spotify.fetchProfile = async function (accessToken) {
  const res = await Spotify.apiRequest("/me", { token: accessToken });
  if (!res.ok) {
    console.log(await res.text());
    return null;
  }
  return res.json();
};

/* ------------------------------------------------------------------ */
/* OAuth (PKCE)                                                        */
/* ------------------------------------------------------------------ */

/**
 * Ensure a valid access token: reuse, refresh, handle OAuth callback, or
 * redirect to login. Returns null when a redirect is in progress.
 * @returns {Promise<?string>}
 */
Spotify.ensureValidToken = async function () {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const returnedState = params.get("state");

  let session = Spotify.loadSession();

  // 1. Existing session → check expiry, refresh if possible
  if (session?.access_token && session?.expires_at) {
    console.log("Session Exists.");
    if (Date.now() <= session.expires_at) {
      return session.access_token;
    }
    if (session.refresh_token) {
      console.log("Refreshing Token.");
      session = await Spotify.refreshAccessToken(session.refresh_token);
      const newSession = {
        access_token: session.access_token,
        refresh_token: session.refresh_token || session.refresh_token_old,
        expires_at: Date.now() + session.expires_in * 1000,
      };
      Spotify.saveSession(newSession);
      return newSession.access_token;
    }
    console.log("Clearing Session.");
    Store.remove("spotify_session");
  }

  // 2. OAuth callback
  if (code) {
    const expectedState = Store.get("spotify_oauth_state");
    if (!returnedState || returnedState !== expectedState) {
      console.error("Spotify OAuth state mismatch", {
        returnedState,
        expectedState,
      });
      Store.remove("spotify_oauth_state");
      return null;
    }
    console.log("Returned from Spotify with code; exchanging for token.");
    const tokenData = await Spotify.exchangeCodeForToken(code);
    Store.remove("spotify_code_verifier");
    const newSession = {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: Date.now() + tokenData.expires_in * 1000,
    };
    Spotify.saveSession(newSession);
    Store.remove("spotify_oauth_state");

    const profile = await Spotify.fetchProfile(newSession.access_token);
    if (profile) {
      Store.setJSON("spotify_user", {
        id: profile.id,
        display_name: profile.display_name,
      });
    }
    Spotify.updateUserDisplay();

    // clean URL (important) — strip only the OAuth params, keep e.g. ?chart=
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete("code");
    cleanUrl.searchParams.delete("state");
    window.history.replaceState({}, document.title, cleanUrl);
    return newSession.access_token;
  }

  // 3. Not logged in → redirect (page will reload)
  console.log("Spotify Login needed.");
  await Spotify.redirectToLogin();
  return null;
};

/** @param {string} refreshToken @returns {Promise<object>} */
Spotify.refreshAccessToken = function (refreshToken) {
  return Spotify.tokenRequest({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: SpotifyConfig.clientId,
  });
};

/** @param {string} code @returns {Promise<object>} */
Spotify.exchangeCodeForToken = function (code) {
  return Spotify.tokenRequest({
    client_id: SpotifyConfig.clientId,
    grant_type: "authorization_code",
    code,
    redirect_uri: SpotifyConfig.redirectUri,
    code_verifier: Store.get("spotify_code_verifier"),
  });
};

/** @param {number} [length=128] @returns {string} PKCE code verifier */
Spotify.generateVerifier = function (length = 128) {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const random = crypto.getRandomValues(new Uint8Array(length));
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars[random[i] % chars.length];
  }
  return result;
};

/** @param {string} verifier @returns {Promise<string>} base64url challenge */
Spotify.generateChallenge = async function (verifier) {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
};

/** Redirect the browser to the Spotify authorization page. */
Spotify.redirectToLogin = async function () {
  const verifier = Spotify.generateVerifier();
  Store.set("spotify_code_verifier", verifier);
  const state = crypto.randomUUID();
  Store.set("spotify_oauth_state", state);
  const challenge = await Spotify.generateChallenge(verifier);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: SpotifyConfig.clientId,
    scope:
      "user-read-playback-state user-read-currently-playing user-modify-playback-state",
    redirect_uri: SpotifyConfig.redirectUri,
    code_challenge_method: "S256",
    code_challenge: challenge,
    state,
    show_dialog: "true",
  });
  window.location.href =
    "https://accounts.spotify.com/authorize?" + params.toString();
};

/* ------------------------------------------------------------------ */
/* Transport controls                                                  */
/* ------------------------------------------------------------------ */

/** Resume playback. */
Spotify.play = () => Spotify.apiRequest("/me/player/play", { method: "PUT" });
/** Pause playback. */
Spotify.pause = () => Spotify.apiRequest("/me/player/pause", { method: "PUT" });
/** Seek to the start of the current track. */
Spotify.restartTrack = () =>
  Spotify.apiRequest("/me/player/seek?position_ms=0", { method: "PUT" });
/** Skip to the next track. */
Spotify.next = () => Spotify.apiRequest("/me/player/next", { method: "POST" });
/** Skip to the previous track. */
Spotify.previous = () =>
  Spotify.apiRequest("/me/player/previous", { method: "POST" });

/* ------------------------------------------------------------------ */
/* Lifecycle                                                           */
/* ------------------------------------------------------------------ */

/** Clear all Spotify auth/session data and reload. */
Spotify.logout = function () {
  Store.remove("spotify_session");
  Store.remove("spotify_code_verifier");
  Store.remove("spotify_oauth_state");
  Store.remove("spotify_user");
  window.history.replaceState({}, document.title, window.location.pathname);
  window.location.reload();
};

/** Enter Spotify mode: authenticate, start polling, swap UI to synced view. */
Spotify.start = async function () {
  Spotify.sync.stopSpotifyMode = 0;
  const token = await Spotify.ensureValidToken();
  if (!token) return; // redirect happening
  Spotify.startScrollSync(token);
  // #spotify-text, #albumArt, .spotify-controls, padding + manual-nav hide are
  // applied by fetchState once a live player is confirmed (204 case otherwise).
  $("#spotify-disable").show();
  $("#spotify-enable").hide();
};

/** Leave Spotify mode: stop polling, restore manual UI. */
Spotify.stop = function () {
  Spotify.sync.stopSpotifyMode = 1;
  clearTimeout(Spotify.sync.loopTimeOut);
  $(`
    #spotify-enable,
    .manual-nav-buttons
  `).show();
  $(`
    #spotify-disable,
    #spotify-text,
    #albumArt,
    #chart-timesynced,
    .spotify-controls
  `).hide();
  $("#song").css({ "padding-bottom": "2rem", "padding-top": "2rem" });
  if (Charts.state.songIndex === Charts.NO_CHART_INDEX) {
    Charts.loadSong(0);
  }
};

/** Apply config-driven visibility (playlist link, enable button). */
Spotify.applyConfigVisibility = function () {
  if (SpotifyConfig.playlist !== "") {
    $("#spotify-playlist-link").prop("href", SpotifyConfig.playlist).show();
  }
  if (SpotifyConfig.clientId === "") {
    $("#spotify-enable").hide();
  }
};
