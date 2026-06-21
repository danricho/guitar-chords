if (spotify_playlist != "") {
  $("#spotify-playlist-link").prop("href", spotify_playlist).show();
}
if (spotify_clientId == "") {
  $("#spotify-enable").hide();
}

let isTabActive = true;

document.addEventListener("visibilitychange", () => {
  isTabActive = document.visibilityState === "visible";
});

const spotifySync = {
  accessToken: null,
  duration: 0,
  position: 0,
  lastUpdateTime: 0,
  isPlaying: false,
  stopSpotifyMode: 1,
};

async function fetchSpotifyState() {
  const res = await fetch("https://api.spotify.com/v1/me/player", {
    headers: {
      Authorization: `Bearer ${spotifySync.accessToken}`,
    },
  });
  if (spotifySync.stopSpotifyMode) return;

  if (res.status === 204) {
    console.log("No active Spotify player!");
    $("#spotify-no-player").show();
    $(`
      #spotify-progress,
      #spotify-text,
      #albumArt,
      #chart-timesynced,
      .spotify-controls
    `).hide();
    return null;
  }
  $("#spotify-no-player").hide();
  $(`
    #spotify-text,
    #albumArt,
    .spotify-controls
  `).show();

  if (!res.ok) return;

  const data = await res.json();
  if (!data || !data.item) return;

  // console.log(data);
  spotifySync.duration = data.item.duration_ms;
  spotifySync.position = data.progress_ms;
  spotifySync.name = data.item.name;
  spotifySync.artist = data.item.artists[0].name;
  spotifySync.isPlaying = data.is_playing;
  spotifySync.lastUpdateTime = performance.now();
  spotifySync.percent = (data.progress_ms / data.item.duration_ms) * 100;

  $("#spotify-device").text(`Playing on '${data.device.name}'`);
  $("#spotify-song-id").text(`Song ID: ${data.item.id}`);
  $("#spotify-song-match span").text(
    `${data.item.name} - ${data.item.artists[0].name}`,
  );
  spotify_capo_change_song;

  $("#spotify-percent-played").text(
    "" + Math.round(spotifySync.percent) + " %",
  );
  $("#spotify-pause").toggle(spotifySync.isPlaying);
  $("#spotify-play").toggle(!spotifySync.isPlaying);

  const index = charts.findIndex(
    (song) => song.name == data.item.name + " - " + data.item.artists[0].name,
  );
  if (index == -1) {
    song_index = index;
    if (data.item.id == spotify_capo_change_song) {
      $("#song").html(`
        <h2 class="text-xl mb-3">Change Capo!</h2>
        <button id="spotify-next" class="btn-outline size-9 p-1" onclick="spotifyNext()">
          <svg class="w-full h-full" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24">
            <path fill-rule="evenodd" d="M17 6a1 1 0 1 0-2 0v4L8.6 5.2A1 1 0 0 0 7 6v12a1 1 0 0 0 1.6.8L15 14v4a1 1 0 1 0 2 0V6Z" clip-rule="evenodd"></path>
          </svg>
        </button>
      `);
    } else {
      $("#song").html(
        `<h2 class="text-xl">No ChordPro chart for "${data.item.name} - ${data.item.artists[0].name}".</h2>`,
      );
    }
    $("#song-info").hide();
    $("#spotify-progress").hide();
    $("#song-info-clone").remove();
    clearChords();
    $("#fretboards").html(
      "<div class='w-full text-center'><em>No Chords</em></div>",
    );
    console.log(
      "No Chart for song:",
      data.item.name + " - " + data.item.artists[0].name,
    );
    $("#heading-title").text(
      data.item.name + " - " + data.item.artists[0].name,
    );
  } else {
    if ($("#spotify-ident").text() != charts[index].name) {
      song_index = index;
      $("#chart-index").text(song_index + 1);
      $("#charts-available").text(charts.length);
      renderSongChart(charts[song_index].chordProChart, charts[index].name);
      $("#content").animate({ scrollTop: 0 }, 10);
      $("#heading-title").text(charts[song_index].name);
      // delay on track change
      // spotifyPause(); setTimeout(spotifyPlay, 5000); // disabled for now
    } else {
      /* ALREADY SHOWING WHAT WE NEED */
    }
  }
  updateAlbumArt(data);
}
let currentTrackId = null;
function updateAlbumArt(state) {
  const trackId = state?.item?.id;
  if (!trackId || trackId === currentTrackId) {
    return;
  }
  currentTrackId = trackId;
  document.getElementById("albumArt").src = state.item.album.images[1].url;
  // index 0 is 640 x 640, 1 is 300x300 and 2 is 64x64
  console.log("Updated shown Album Art.");
}
async function fetchSpotifyProfile(accessToken) {
  const res = await fetch("https://api.spotify.com/v1/me", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!res.ok) {
    console.log(await res.text());
    return null;
  }
  return await res.json();
}
async function pollingLoop() {
  await fetchSpotifyState();

  if (spotifySync.isPlaying) {
    if ($("#song .event").length) {
      // a timesynced chart is rendered
      scrollToVirtualTimestamp(spotifySync.position);
      $("#chart-timesynced").show();
      $("#spotify-progress").hide();
    } else if ($("#song .chord-sheet").length) {
      // a chart is rendered
      // this is the scroll by percentage song
      $("#chart-timesynced").hide();
      $("#spotify-progress").show();
      var $elem = $("#content"); // scrollable element
      // Calculate the maximum scrollable distance
      var maxScroll = $elem[0].scrollHeight - $elem.outerHeight();
      // Calculate the pixel position and apply it
      var scrollTarget =
        maxScroll * (spotifySync.percent / 100) + $("#song-info").outerHeight();
      if (isTabActive) {
        $elem.animate(
          {
            scrollTop: scrollTarget,
          },
          1000,
        );
      }
    }
  }

  if (spotifySync.stopSpotifyMode) return;
  spotifySync.loopTimeOut = setTimeout(pollingLoop, 2000);
}
function startSpotifyScrollSync(accessToken) {
  spotifySync.accessToken = accessToken;
  pollingLoop();
}
function saveSession(session) {
  localStorage.setItem("spotify_session", JSON.stringify(session));
}
function loadSession() {
  const raw = localStorage.getItem("spotify_session");
  return raw ? JSON.parse(raw) : null;
}
function loadSpotifyUser() {
  const raw = localStorage.getItem("spotify_user");
  return raw ? JSON.parse(raw) : null;
}
function updateSpotifyUserDisplay() {
  const user = loadSpotifyUser();

  if (!user) {
    $("#spotify-user").text("Not connected");
    return;
  }

  $("#spotify-user").text("Logged in as: " + user.display_name);
}
async function ensureValidSpotifyToken() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const returnedState = params.get("state");

  let session = loadSession();
  // =========================
  // 1. If session exists → check expiry
  // =========================
  if (session?.access_token && session?.expires_at) {
    console.log("Session Exists.");
    const isExpired = Date.now() > session.expires_at;
    if (!isExpired) {
      return session.access_token;
    }
    // try refresh
    if (session.refresh_token) {
      console.log("Refreshing Token.");
      session = await refreshAccessToken(session.refresh_token);
      const newSession = {
        access_token: session.access_token,
        refresh_token: session.refresh_token || session.refresh_token_old,
        expires_at: Date.now() + session.expires_in * 1000,
      };
      saveSession(newSession);
      return newSession.access_token;
    }

    console.log("Clearing Session.");
    localStorage.removeItem("spotify_session");
  }
  // =========================
  // 2. Handle OAuth callback
  // =========================
  if (code) {
    const expectedState = localStorage.getItem("spotify_oauth_state");
    if (!returnedState || returnedState !== expectedState) {
      console.error("Spotify OAuth state mismatch", {
        returnedState,
        expectedState,
      });
      localStorage.removeItem("spotify_oauth_state");
      return null;
    }
    console.log(
      "Return from Spotify with Code and getting Token then saving as session.",
    );
    const tokenData = await exchangeCodeForToken(code);
    localStorage.removeItem("spotify_code_verifier");
    const newSession = {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: Date.now() + tokenData.expires_in * 1000,
    };
    saveSession(newSession);
    localStorage.removeItem("spotify_oauth_state");

    const profile = await fetchSpotifyProfile(newSession.access_token);
    if (profile) {
      localStorage.setItem(
        "spotify_user",
        JSON.stringify({
          id: profile.id,
          display_name: profile.display_name,
        }),
      );
    }

    updateSpotifyUserDisplay();

    // clean URL (important)
    window.history.replaceState({}, document.title, "/");
    return newSession.access_token;
  }
  // =========================
  // 3. Not logged in → redirect to Spotify
  // =========================
  console.log("Spotify Login needed.");
  await redirectToSpotifyLogin();
  // IMPORTANT: stop execution (page will reload)
  return null;
}
async function refreshAccessToken(refreshToken) {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: spotify_clientId,
  });
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  return await res.json();
}
async function exchangeCodeForToken(code) {
  const verifier = localStorage.getItem("spotify_code_verifier");
  const body = new URLSearchParams({
    client_id: spotify_clientId,
    grant_type: "authorization_code",
    code,
    redirect_uri: spotify_redirectUri,
    code_verifier: verifier,
  });
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  return await res.json();
}
function generateVerifier(length = 128) {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const random = crypto.getRandomValues(new Uint8Array(length));
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars[random[i] % chars.length];
  }
  return result;
}
async function generateChallenge(verifier) {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
async function redirectToSpotifyLogin() {
  const verifier = generateVerifier();
  localStorage.setItem("spotify_code_verifier", verifier);
  const state = crypto.randomUUID();
  localStorage.setItem("spotify_oauth_state", state);
  const challenge = await generateChallenge(verifier);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: spotify_clientId,
    scope:
      "user-read-playback-state user-read-currently-playing user-modify-playback-state",
    redirect_uri: spotify_redirectUri,
    code_challenge_method: "S256",
    code_challenge: challenge,
    state: state,
    show_dialog: "true",
  });
  window.location.href =
    "https://accounts.spotify.com/authorize?" + params.toString();
}
async function spotifyPlay() {
  await fetch("https://api.spotify.com/v1/me/player/play", {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${spotifySync.accessToken}`,
    },
  });
}
async function spotifyRestartTrack() {
  await fetch("https://api.spotify.com/v1/me/player/seek?position_ms=0", {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${spotifySync.accessToken}`,
    },
  });
}
async function spotifyPause() {
  await fetch("https://api.spotify.com/v1/me/player/pause", {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${spotifySync.accessToken}`,
    },
  });
}
async function spotifyNext() {
  await fetch("https://api.spotify.com/v1/me/player/next", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${spotifySync.accessToken}`,
    },
  });
}
async function spotifyPrevious() {
  await fetch("https://api.spotify.com/v1/me/player/previous", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${spotifySync.accessToken}`,
    },
  });
}
function spotifyLogout() {
  // Clear auth/session data
  localStorage.removeItem("spotify_session");
  localStorage.removeItem("spotify_code_verifier");
  localStorage.removeItem("spotify_oauth_state");
  localStorage.removeItem("spotify_user");
  // Remove any auth code from URL
  window.history.replaceState({}, document.title, window.location.pathname);
  // Reload page
  window.location.reload();
}
async function start_spotify() {
  spotifySync.stopSpotifyMode = 0;
  const token = await ensureValidSpotifyToken();
  if (!token) return; // redirect happening
  startSpotifyScrollSync(token);
  $(`
    #spotify-disable, 
    #spotify-text, 
    #albumArt, 
    .spotify-controls
  `).show();
  $(`
    #spotify-enable,
    .manual-nav-buttons
  `).hide();
  $("#song").css({ "padding-bottom": "50vh", "padding-top": "50vh" });
}
async function stop_spotify() {
  spotifySync.stopSpotifyMode = 1;
  clearTimeout(spotifySync.loopTimeOut);
  $(`
    #spotify-enable,
    .manual-nav-buttons
  `).show();
  $(`
    #spotify-disable,
    #spotify-progress,
    #spotify-text,
    #albumArt,
    #chart-timesynced,    
    .spotify-controls
  `).hide();
  $("#song").css({ "padding-bottom": "", "padding-top": "" });
  if (song_index == -1) {
    song_index = 0;
    $("#chart-index").text(song_index + 1);
    $("#charts-available").text(charts.length);
    renderSongChart(charts[song_index].chordProChart);
    $("#content").animate({ scrollTop: 0 }, 10);
    $("#heading-title").text(charts[song_index].name);
  }
}
