/**
 * sonos-proxy/server.js — local UPnP/SOAP bridge to Sonos speakers.
 *
 * Exists so the browser (served over HTTPS) never has to talk to a Sonos
 * speaker directly (plain HTTP on the LAN — mixed content). nginx proxies
 * /api/sonos/* to this service; this service is the one that speaks SOAP to
 * the speakers on port 1400. See ROADMAP.md for the full design.
 *
 * No dependencies — Node's built-in `http` module only, matching this
 * repo's no-build-step philosophy. Run with `node server.js`.
 *
 * Routes (all take `?speaker=upstairs|downstairs`):
 *   GET  /status      -> { title, artist, album, trackUri, spotifyTrackId,
 *                           albumArtPath, positionMs, durationMs, isPlaying,
 *                           transportState }
 *   GET  /album-art    -> proxies the speaker's album art image bytes
 *                          (takes `?u=<encoded speaker-relative art path>`,
 *                          which /status's albumArtPath already includes)
 *   POST /play /pause /restart /next /previous -> issues the AVTransport
 *                          action, empty 204 response on success
 */

const http = require("http");
const { URL } = require("url");

const SPEAKERS = {
  upstairs: process.env.SONOS_SPEAKER_UPSTAIRS_IP,
  downstairs: process.env.SONOS_SPEAKER_DOWNSTAIRS_IP,
};

const PORT = process.env.PORT || 3000;
const SONOS_PORT = 1400;
const REQUEST_TIMEOUT_MS = 5000;

/* ------------------------------------------------------------------ */
/* Low-level HTTP to the speaker                                       */
/* ------------------------------------------------------------------ */

/**
 * Plain HTTP request to a speaker, buffered into memory.
 * @returns {Promise<{status: number, headers: object, body: Buffer}>}
 */
function speakerRequest(ip, path, { method = "GET", headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: ip,
        port: SONOS_PORT,
        path,
        method,
        headers,
        timeout: REQUEST_TIMEOUT_MS,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks),
          }),
        );
      },
    );
    req.on("timeout", () =>
      req.destroy(new Error("Speaker request timed out")),
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

/** POST a SOAP AVTransport action, returns the response body as a string. */
async function soapAction(ip, action, params = { InstanceID: 0 }) {
  const paramsXml = Object.entries(params)
    .map(([k, v]) => `<${k}>${v}</${k}>`)
    .join("");
  const envelope =
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">` +
    `<s:Body><u:${action} xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">${paramsXml}</u:${action}></s:Body>` +
    `</s:Envelope>`;

  const res = await speakerRequest(ip, "/MediaRenderer/AVTransport/Control", {
    method: "POST",
    headers: {
      "Content-Type": 'text/xml; charset="utf-8"',
      SOAPACTION: `"urn:schemas-upnp-org:service:AVTransport:1#${action}"`,
      "Content-Length": Buffer.byteLength(envelope),
    },
    body: envelope,
  });

  if (res.status !== 200) {
    throw new Error(
      `Speaker rejected ${action}: HTTP ${res.status} — ${res.body.toString("utf8").slice(0, 300)}`,
    );
  }
  return res.body.toString("utf8");
}

/* ------------------------------------------------------------------ */
/* XML/DIDL-Lite parsing — hand-rolled, no XML library                 */
/* ------------------------------------------------------------------ */

function xmlUnescape(s) {
  return s.replace(
    /&(lt|gt|quot|apos|amp);/g,
    (_, e) => ({ lt: "<", gt: ">", quot: '"', apos: "'", amp: "&" })[e],
  );
}

/** First match of <tag>...</tag> (tag may contain a namespace prefix, e.g. "dc:title"). */
function extractTag(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`));
  return m ? m[1] : null;
}

/** "H:MM:SS" -> milliseconds. */
function relTimeToMs(relTime) {
  if (!relTime) return 0;
  const parts = relTime.split(":").map(Number);
  const [h, m, s] = parts.length === 3 ? parts : [0, ...parts];
  return ((h * 60 + m) * 60 + s) * 1000;
}

/** Spotify track ID out of a TrackURI like "x-sonos-spotify:spotify%3atrack%3a<id>?...". */
function extractSpotifyTrackId(trackUri) {
  if (!trackUri) return null;
  const m = trackUri.match(/spotify(?:%3a|:)track(?:%3a|:)([A-Za-z0-9]+)/i);
  return m ? m[1] : null;
}

function parseGetPositionInfo(soapXml) {
  const body = extractTag(soapXml, "u:GetPositionInfoResponse") || soapXml;
  const trackDuration = extractTag(body, "TrackDuration");
  const relTime = extractTag(body, "RelTime");
  const trackUriRaw = extractTag(body, "TrackURI") || "";
  const trackUri = xmlUnescape(trackUriRaw);
  const metaDataRaw = extractTag(body, "TrackMetaData") || "";
  // TrackMetaData is DIDL-Lite XML embedded as escaped text, one level
  // deeper than TrackURI above — unescaping it once just gets back the DIDL
  // XML *source*, which still has its own values (title, art URI, etc.)
  // escaped per normal XML rules. Each value pulled out of it needs a
  // second unescape.
  const didl = xmlUnescape(metaDataRaw);
  const didlValue = (tag) => {
    const v = extractTag(didl, tag);
    return v === null ? null : xmlUnescape(v);
  };

  return {
    title: didlValue("dc:title"),
    artist: didlValue("dc:creator"),
    album: didlValue("upnp:album"),
    // A speaker-relative path with its own query string, re-issued to the
    // speaker verbatim by /album-art below — not meant to be
    // human-readable, just replayed as-is once unescaped back to real `&`s.
    albumArtURI: didlValue("upnp:albumArtURI"),
    trackUri,
    spotifyTrackId: extractSpotifyTrackId(trackUri),
    positionMs: relTimeToMs(relTime),
    durationMs: relTimeToMs(trackDuration),
  };
}

function parseGetTransportInfo(soapXml) {
  const body = extractTag(soapXml, "u:GetTransportInfoResponse") || soapXml;
  const state = extractTag(body, "CurrentTransportState") || "STOPPED";
  return { transportState: state, isPlaying: state === "PLAYING" };
}

/* ------------------------------------------------------------------ */
/* Route handlers                                                      */
/* ------------------------------------------------------------------ */

function speakerIp(query) {
  const name = query.get("speaker");
  const ip = name && SPEAKERS[name];
  if (!ip) {
    throw Object.assign(
      new Error(
        `Unknown or unconfigured speaker "${name}" — expected one of: ${Object.keys(SPEAKERS).join(", ")}`,
      ),
      { statusCode: 400 },
    );
  }
  return ip;
}

async function handleStatus(query, res) {
  const ip = speakerIp(query);
  const [positionXml, transportXml] = await Promise.all([
    soapAction(ip, "GetPositionInfo"),
    soapAction(ip, "GetTransportInfo"),
  ]);
  const position = parseGetPositionInfo(positionXml);
  const transport = parseGetTransportInfo(transportXml);

  const speakerName = query.get("speaker");
  // Prefixed with /api/sonos so the frontend can use this directly as an
  // <img src> — this service is only ever reached through nginx's
  // /api/sonos/ proxy (see nginx.conf), never called on its own.
  const albumArtPath = position.albumArtURI
    ? `/api/sonos/album-art?speaker=${speakerName}&u=${encodeURIComponent(position.albumArtURI)}`
    : null;

  sendJson(res, 200, {
    title: position.title,
    artist: position.artist,
    album: position.album,
    trackUri: position.trackUri,
    spotifyTrackId: position.spotifyTrackId,
    albumArtPath,
    positionMs: position.positionMs,
    durationMs: position.durationMs,
    isPlaying: transport.isPlaying,
    transportState: transport.transportState,
  });
}

async function handleAlbumArt(query, res) {
  const ip = speakerIp(query);
  const artPath = query.get("u");
  if (!artPath)
    throw Object.assign(new Error("Missing ?u= album art path"), {
      statusCode: 400,
    });

  const art = await speakerRequest(ip, artPath);
  if (art.status !== 200) {
    throw Object.assign(
      new Error(`Speaker returned HTTP ${art.status} for album art`),
      { statusCode: 502 },
    );
  }
  res.writeHead(200, {
    "Content-Type": art.headers["content-type"] || "image/jpeg",
  });
  res.end(art.body);
}

const TRANSPORT_ACTIONS = {
  play: (ip) => soapAction(ip, "Play", { InstanceID: 0, Speed: 1 }),
  pause: (ip) => soapAction(ip, "Pause"),
  restart: (ip) =>
    soapAction(ip, "Seek", {
      InstanceID: 0,
      Unit: "REL_TIME",
      Target: "0:00:00",
    }),
  next: (ip) => soapAction(ip, "Next"),
  previous: (ip) => soapAction(ip, "Previous"),
};

async function handleTransportAction(action, query, res) {
  const ip = speakerIp(query);
  await TRANSPORT_ACTIONS[action](ip);
  res.writeHead(204);
  res.end();
}

/* ------------------------------------------------------------------ */
/* HTTP server                                                         */
/* ------------------------------------------------------------------ */

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (req.method === "GET" && url.pathname === "/status") {
      return await handleStatus(url.searchParams, res);
    }
    if (req.method === "GET" && url.pathname === "/album-art") {
      return await handleAlbumArt(url.searchParams, res);
    }
    const action = url.pathname.slice(1);
    if (req.method === "POST" && TRANSPORT_ACTIONS[action]) {
      return await handleTransportAction(action, url.searchParams, res);
    }
    sendJson(res, 404, {
      error: `No such route: ${req.method} ${url.pathname}`,
    });
  } catch (err) {
    console.error(err);
    sendJson(res, err.statusCode || 502, { error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`sonos-proxy listening on :${PORT}`);
  console.log(
    `Configured speakers: ${Object.entries(SPEAKERS)
      .map(([k, v]) => `${k}=${v || "(not set)"}`)
      .join(", ")}`,
  );
});
