/**
 * auth-proxy/server.js — passcode gate for the whole site.
 *
 * A dependency-free Node HTTP server (same shape as sonos-proxy/server.js),
 * run as its own Compose service with no published ports. nginx asks it
 * about every request via the auth_request module, so nothing under the
 * document root — charts, print.html, the Spotify client ID, /api/sonos/ —
 * is served to an unauthenticated visitor.
 *
 * Endpoints (nginx maps /auth/* onto these; see nginx.conf):
 *   GET  /verify   204 if the request carries a valid session cookie, else 401.
 *                  Called internally by nginx, never by the browser.
 *   GET  /login    the login page (self-contained HTML, no external assets —
 *                  it is served *before* auth, so it cannot pull from the
 *                  protected document root).
 *   POST /login    checks the passcode, sets the session cookie, redirects.
 *   GET  /logout   clears the cookie and returns to the login page.
 *
 * Session cookie: "<expiry-ms>.<hmac-sha256(expiry-ms, secret)>". Signed
 * rather than stored, so there is no session table to persist and restarts
 * never log anyone out (the secret is persisted instead — see below).
 *
 * Files in data/ (git-ignored, created on first boot):
 *   auth.json        {"passcode": "..."} — a random one is generated and
 *                    logged if the file is missing. Edit it to set your own.
 *   secret_key.txt   cookie signing key. Deleting it invalidates all
 *                    existing sessions (i.e. logs everyone out).
 *
 * This is a shared-passcode gate, not per-user access control: everyone who
 * knows the passcode is the same anonymous visitor. It keeps the public out;
 * it does not distinguish between people who are let in.
 */

const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT) || 3000;
const COOKIE_NAME = "gc_session";
const SESSION_MS = 90 * 24 * 60 * 60 * 1000; // 90 days, same as web500

const DATA_DIR = path.join(__dirname, "data");
const AUTH_FILE = path.join(DATA_DIR, "auth.json");
const SECRET_FILE = path.join(DATA_DIR, "secret_key.txt");

/* ------------------------------------------------------------------ */
/* Config                                                              */
/* ------------------------------------------------------------------ */

function loadOrCreateAuth() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(AUTH_FILE)) {
    const passcode = crypto.randomBytes(6).toString("base64url");
    fs.writeFileSync(AUTH_FILE, JSON.stringify({ passcode }, null, 2) + "\n");
    console.log(
      `[auth] created ${AUTH_FILE} with a random passcode: ${passcode}\n` +
        `[auth] edit that file to set your own, then restart this service`,
    );
  }
  return JSON.parse(fs.readFileSync(AUTH_FILE, "utf8"));
}

function loadOrCreateSecret() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(SECRET_FILE)) {
    fs.writeFileSync(SECRET_FILE, crypto.randomBytes(32).toString("hex") + "\n");
    console.log(`[auth] created ${SECRET_FILE} (cookie signing key)`);
  }
  return fs.readFileSync(SECRET_FILE, "utf8").trim();
}

const AUTH = loadOrCreateAuth();
const SECRET = loadOrCreateSecret();

if (!AUTH.passcode) {
  console.error(`[auth] no "passcode" in ${AUTH_FILE} — refusing to start`);
  process.exit(1);
}

/* ------------------------------------------------------------------ */
/* Session cookie                                                      */
/* ------------------------------------------------------------------ */

const sign = (value) =>
  crypto.createHmac("sha256", SECRET).update(String(value)).digest("hex");

/** Constant-time string compare that tolerates unequal lengths. */
function safeEqual(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function makeCookieValue() {
  const expiry = Date.now() + SESSION_MS;
  return `${expiry}.${sign(expiry)}`;
}

function isValidCookieValue(value) {
  if (!value) return false;
  const dot = value.indexOf(".");
  if (dot === -1) return false;
  const expiry = value.slice(0, dot);
  const mac = value.slice(dot + 1);
  if (!/^\d+$/.test(expiry)) return false;
  if (!safeEqual(mac, sign(expiry))) return false;
  return Number(expiry) > Date.now();
}

function parseCookies(header) {
  const out = {};
  for (const part of (header || "").split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    out[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
  }
  return out;
}

/**
 * Cookies are marked Secure whenever the *browser's* request was HTTPS.
 * nginx sits behind a tunnel here, so its own $scheme is http — the real
 * scheme arrives as X-Forwarded-Proto (see the map in nginx.conf).
 */
function cookieAttrs(req, maxAgeSeconds) {
  const proto = String(req.headers["x-forwarded-proto"] || "").toLowerCase();
  const secure = proto === "https" ? " Secure;" : "";
  return `Path=/; HttpOnly;${secure} SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

/* ------------------------------------------------------------------ */
/* Login throttling                                                    */
/* ------------------------------------------------------------------ */

// Small in-memory backoff so the passcode can't be brute-forced quickly.
// Per-IP, resets on restart — enough for a personal deployment.
const attempts = new Map(); // ip -> { count, until }
const MAX_ATTEMPTS = 8;
const LOCKOUT_MS = 5 * 60 * 1000;

function clientIp(req) {
  const fwd = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return fwd || req.socket.remoteAddress || "unknown";
}

function isLockedOut(ip) {
  const rec = attempts.get(ip);
  if (!rec) return false;
  if (Date.now() > rec.until) {
    attempts.delete(ip);
    return false;
  }
  return rec.count >= MAX_ATTEMPTS;
}

function noteFailure(ip) {
  const rec = attempts.get(ip) || { count: 0, until: 0 };
  rec.count += 1;
  rec.until = Date.now() + LOCKOUT_MS;
  attempts.set(ip, rec);
}

/* ------------------------------------------------------------------ */
/* Login page                                                          */
/* ------------------------------------------------------------------ */

/**
 * Only relative, single-slash paths are accepted as a post-login
 * destination — "//evil.example" and absolute URLs would otherwise turn
 * this into an open redirect.
 */
function safeNext(raw) {
  const value = String(raw || "");
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  if (value.startsWith("/auth/")) return "/";
  return value;
}

const escapeHtml = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );

function loginPage({ error = "", next = "/" } = {}) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Guitar Chords</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<style>
  :root { --primary: #ff9900; --bg: #0f0f11; --card: #1a1a1e; --ink: #f4f4f5; --muted: #a1a1aa; --border: #2e2e35; }
  @media (prefers-color-scheme: light) {
    :root { --bg: #f4f4f5; --card: #ffffff; --ink: #18181b; --muted: #71717a; --border: #e4e4e7; }
  }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
         background: var(--bg); color: var(--ink); padding: 1.5rem;
         font-family: -apple-system, "Segoe UI", system-ui, sans-serif; }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: 0.75rem;
          padding: 2rem; width: 100%; max-width: 22rem; text-align: center; }
  svg { width: 3.5rem; height: 3.5rem; fill: var(--primary); }
  h1 { font-size: 1.25rem; margin: 0.75rem 0 0.25rem; }
  p.sub { color: var(--muted); font-size: 0.85rem; margin: 0 0 1.5rem; }
  input { width: 100%; padding: 0.7rem 0.85rem; font-size: 1rem; text-align: center;
          border: 1px solid var(--border); border-radius: 0.5rem; background: var(--bg);
          color: var(--ink); }
  input:focus { outline: 2px solid var(--primary); outline-offset: 1px; }
  button { width: 100%; margin-top: 0.75rem; padding: 0.7rem; font-size: 0.95rem; font-weight: 600;
           border: none; border-radius: 0.5rem; background: var(--primary); color: #1a1a1e;
           cursor: pointer; }
  button:hover { filter: brightness(1.08); }
  .error { color: #f87171; font-size: 0.85rem; margin: 0 0 0.85rem; }
</style>
</head>
<body>
  <form class="card" method="POST" action="/auth/login">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50" aria-hidden="true">
      <path d="M15.94,49.85C8.48,47.85,1.59,21.4,5.07,8.47c2.52-9.39,15-9.38,23.86-7s19.66,8.64,17.14,18C42.6,32.41,23.39,51.85,15.94,49.85Z"/>
    </svg>
    <h1>Guitar Chords</h1>
    <p class="sub">Enter the passcode to continue</p>
    ${error ? `<p class="error">${escapeHtml(error)}</p>` : ""}
    <input type="password" name="passcode" placeholder="Passcode" autocomplete="current-password"
           autofocus required inputmode="text">
    <input type="hidden" name="next" value="${escapeHtml(next)}">
    <button type="submit">Unlock</button>
  </form>
</body>
</html>`;
}

/* ------------------------------------------------------------------ */
/* Server                                                              */
/* ------------------------------------------------------------------ */

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 4096) req.destroy(); // login form is tiny
    });
    req.on("end", () => resolve(data));
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const route = url.pathname;

  // nginx's auth_request subrequest — body-less, answered with a status only.
  if (route === "/verify") {
    const cookie = parseCookies(req.headers.cookie)[COOKIE_NAME];
    if (isValidCookieValue(cookie)) {
      res.writeHead(204);
      res.end();
    } else {
      res.writeHead(401);
      res.end();
    }
    return;
  }

  // HEAD is handled alongside GET (Node suppresses the body itself) so that
  // health checks and `curl -I` don't get a misleading 404.
  if (route === "/login" && (req.method === "GET" || req.method === "HEAD")) {
    // Already signed in: skip the form.
    if (isValidCookieValue(parseCookies(req.headers.cookie)[COOKIE_NAME])) {
      send(res, 302, "", { Location: safeNext(url.searchParams.get("next")) });
      return;
    }
    send(res, 200, loginPage({ next: safeNext(url.searchParams.get("next")) }));
    return;
  }

  if (route === "/login" && req.method === "POST") {
    const ip = clientIp(req);
    const form = new URLSearchParams(await readBody(req));
    const next = safeNext(form.get("next"));

    if (isLockedOut(ip)) {
      console.log(`[auth] locked out login attempt from ${ip}`);
      send(
        res,
        429,
        loginPage({ error: "Too many attempts. Try again later.", next }),
      );
      return;
    }

    if (!safeEqual(form.get("passcode") || "", AUTH.passcode)) {
      noteFailure(ip);
      console.log(`[auth] failed login from ${ip}`);
      send(res, 401, loginPage({ error: "Wrong passcode.", next }));
      return;
    }

    attempts.delete(ip);
    console.log(`[auth] login from ${ip}`);
    send(res, 302, "", {
      Location: next,
      "Set-Cookie": `${COOKIE_NAME}=${makeCookieValue()}; ${cookieAttrs(req, SESSION_MS / 1000)}`,
    });
    return;
  }

  if (route === "/logout") {
    send(res, 302, "", {
      Location: "/auth/login",
      "Set-Cookie": `${COOKIE_NAME}=; ${cookieAttrs(req, 0)}`,
    });
    return;
  }

  send(res, 404, "Not found");
});

server.listen(PORT, () => {
  console.log(`[auth] listening on ${PORT}`);
});
