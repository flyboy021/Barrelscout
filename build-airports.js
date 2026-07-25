// build-airports.js — Regenerate airports.json from EVERY station that currently
// reports a METAR (airports, AWOS, mountain-pass and summit sensors, worldwide).
// This is the fix for "a station isn't in the index" — run it and every reporting
// station gets added. Re-run it monthly to stay current.
//
// Requirements: Node 18+ (has built-in fetch). Run it from this folder:
//     cd ~/Desktop/wx-radius-web
//     node build-airports.js
//
// It MERGES with the existing airports.json, so nothing you already have is lost.
// When it finishes, re-upload airports.json to GitHub and re-sync it into the
// native app's www/ folder.

const fs = require("fs");
const OUT = "airports.json";
const API = "https://aviationweather.gov/api/data/metar";
const UA = "VicinityApp/1.0 (dehaven.jeremy@gmail.com)";
const STEP = 10;                    // degrees per tile (smaller = more thorough, slower)
const DELAY_MS = 150;               // pause between tiles (raise if you get rate-limited)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchBox(s, w, n, e) {
  const url = `${API}?bbox=${s},${w},${n},${e}&format=json`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
      if (r.ok) return await r.json();
    } catch (e) { /* retry */ }
    await sleep(600);
  }
  return [];
}

(async () => {
  const found = new Map(); // icaoId -> [id, lat, lon]

  // Seed from the existing index so nothing already curated is ever dropped.
  try {
    for (const p of JSON.parse(fs.readFileSync(OUT, "utf8"))) found.set(p[0], p);
  } catch (e) { /* no existing file — fine */ }
  const before = found.size;

  const boxes = [];
  for (let lat = -90; lat < 90; lat += STEP)
    for (let lon = -180; lon < 180; lon += STEP)
      boxes.push([lat, lon, Math.min(lat + STEP, 90), Math.min(lon + STEP, 180)]);

  console.log(`Scanning ${boxes.length} tiles for reporting stations...\n`);
  let done = 0;
  for (const [s, w, n, e] of boxes) {
    const arr = await fetchBox(s, w, n, e);
    for (const m of arr || []) {
      if (!m || !m.icaoId || m.lat == null || m.lon == null) continue;
      const prev = found.get(m.icaoId);
      // add new stations, and upgrade any existing entry that has no name yet
      if (!prev || !prev[3])
        found.set(m.icaoId, [m.icaoId, +(+m.lat).toFixed(4), +(+m.lon).toFixed(4), (m.name || "").trim()]);
    }
    if (++done % 25 === 0) console.log(`  ${done}/${boxes.length} tiles  ·  ${found.size} stations so far`);
    await sleep(DELAY_MS);
  }

  // Second pass: give a name to every station that still lacks one (non-reporting fields
  // like KEYE), using the FAA airport database. This makes name/city search work for all.
  const AIRPORT_API = "https://aviationweather.gov/api/data/airport";
  const noName = [...found.values()].filter((e) => !e[3]).map((e) => e[0]);
  console.log(`\nLooking up names for ${noName.length} stations without one...`);
  for (let i = 0; i < noName.length; i += 200) {
    const chunk = noName.slice(i, i + 200);
    let arr = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await fetch(`${AIRPORT_API}?ids=${chunk.join(",")}&format=json`,
          { headers: { "User-Agent": UA, Accept: "application/json" } });
        if (r.ok) { arr = await r.json(); break; }
      } catch (e) { /* retry */ }
      await sleep(600);
    }
    for (const ap of arr || []) {
      const e = found.get(ap.icaoId);
      if (e && !e[3] && ap.name) e[3] = String(ap.name).trim();
    }
    if ((i / 200) % 10 === 0) console.log(`  names ${i}/${noName.length}`);
    await sleep(DELAY_MS);
  }

  const out = [...found.values()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log(`\nDone. ${out.length} stations total (added ${out.length - before} new). Wrote ${OUT}.`);
})();
