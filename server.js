// Zero-dependency server for Wx Radius.
//  1. Serves the static web app (index.html, manifest, sw.js, icons).
//  2. Proxies /api/data/* to the FAA Aviation Weather Center.
//
// The proxy exists because aviationweather.gov does not allow cross-origin
// (CORS) browser requests. By serving the page and the API from the same
// origin, the browser is happy and we add the required User-Agent header.
//
// Run:  node server.js   then open http://localhost:3000

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const AWC_HOST = "aviationweather.gov";
const UA = "WxRadiusApp/1.0 (contact@example.com)"; // identify your app to AWC
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const SUMMARY_SYSTEM = "You are a concise VFR/IFR aviation weather briefer speaking to a general aviation pilot. " +
  "Summarize the given METAR/TAF data in plain spoken English, organized for reading aloud. " +
  "Lead with the overall picture (VFR/MVFR/IFR/LIFR), then call out notable hazards (low ceilings, " +
  "poor visibility, strong/gusty wind, thunderstorms, icing, IFR trends). Keep it under 150 words, " +
  "use short sentences, and avoid raw METAR/TAF jargon codes. Refer to airports by their spoken " +
  "name (e.g. \"Wichita\" instead of \"KICT\") whenever a name is given in the data; only fall back " +
  "to spelling out the identifier if no name is available. Write in plain prose only — no markdown, " +
  "no asterisks, no bullet points, no headers — since this is read aloud as speech. End with a " +
  "one-line reminder that this is not an official weather briefing.";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function proxy(req, res) {
  // Forward /api/data/<endpoint>?<query> to the AWC API.
  const target = "https://" + AWC_HOST + req.url.replace(/^\/api/, "/api");
  const opts = { headers: { "User-Agent": UA, Accept: "application/json" } };
  https
    .get(target, opts, (up) => {
      res.writeHead(up.statusCode, {
        "Content-Type": up.headers["content-type"] || "application/json",
        "Cache-Control": "no-store",
      });
      up.pipe(res);
    })
    .on("error", (e) => {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Upstream weather service unreachable", detail: e.message }));
    });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => { data += chunk; if (data.length > 1e6) req.destroy(); });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

async function summarize(req, res) {
  if (!ANTHROPIC_KEY) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "AI summary is not configured on the server." }));
    return;
  }
  let body;
  try { body = JSON.parse((await readBody(req)) || "{}"); } catch (e) { body = {}; }
  const prompt = String((body && body.prompt) || "").slice(0, 12000);
  if (!prompt) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Missing prompt" }));
    return;
  }
  try {
    const up = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 500,
        system: SUMMARY_SYSTEM,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await up.json();
    if (!up.ok) {
      res.writeHead(up.status, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: (data && data.error && data.error.message) || "AI service error" }));
      return;
    }
    const text = (data.content || []).map((c) => c.text || "").join("").trim();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ summary: text }));
  } catch (e) {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "AI service unreachable", detail: e.message }));
  }
}

function serveStatic(req, res) {
  let rel = decodeURIComponent(req.url.split("?")[0]);
  if (rel === "/") rel = "/index.html";
  const file = path.join(__dirname, path.normalize(rel).replace(/^(\.\.[/\\])+/, ""));
  if (!file.startsWith(__dirname)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404).end("Not found"); return; }
    // index.html and the service worker must always be revalidated, otherwise different
    // devices/browsers can get stuck on different cached app versions indefinitely (the
    // service worker itself decides when to fetch a new version, so a stale HTTP cache of
    // sw.js can hide updates from a tab for hours/days). Other assets can cache briefly.
    const base = path.basename(file);
    const cacheControl = (base === "index.html" || base === "sw.js")
      ? "no-cache"
      : "public, max-age=300";
    res.writeHead(200, {
      "Content-Type": TYPES[path.extname(file)] || "application/octet-stream",
      "Cache-Control": cacheControl,
    });
    res.end(data);
  });
}

http
  .createServer((req, res) => {
    if (req.url.startsWith("/api/summarize")) summarize(req, res);
    else if (req.url.startsWith("/api/")) proxy(req, res);
    else serveStatic(req, res);
  })
  .listen(PORT, () => console.log(`Wx Radius running at http://localhost:${PORT}`));
