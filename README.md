# Wx Radius — Phase 1 (free web app + tip jar)

A mobile web app (PWA) that shows the latest METAR/TAF for every reporting station within
50nm, on a map centered on you, color-coded by flight category. Pilots open a **link** — no
install, no app store. Includes a tip jar. Data: free FAA Aviation Weather Center API.

---

## The one unavoidable bit
The weather service blocks direct browser calls (CORS), so requests must pass through a tiny
proxy. You have two ways to provide it — pick the one that matches how you like to work.

### Option A — No local server (matches "just open the HTML + push to GitHub") ✅ recommended
Deploy the proxy **once** to Cloudflare (free, ~5 min, then forget it). After that the app is
pure static: double-click `index.html` to test, and push to GitHub Pages to publish.

1. Go to https://workers.cloudflare.com → sign up (free) → **Create Worker**.
2. Delete the sample code, paste the contents of **`worker.js`**, click **Deploy**.
3. Copy the worker's URL, e.g. `https://wx-proxy.yourname.workers.dev`.
4. Open `index.html`, find `PROXY_BASE`, and paste that URL:
   ```js
   const PROXY_BASE = "https://wx-proxy.yourname.workers.dev";
   ```
5. **Test:** just double-click `index.html` (or drag it into your browser). Done — no server.
6. **Publish:** push this folder to a GitHub repo → repo **Settings → Pages** → deploy from
   the main branch. GitHub gives you an HTTPS link like
   `https://yourname.github.io/wx-radius-web/` to share with pilots. (HTTPS is required for the
   GPS "find me" feature — GitHub Pages provides it automatically.)

### Option B — Local node server (no Cloudflare account)
Leave `PROXY_BASE = ""` in `index.html`, then run:
```bash
node server.js
```
and open http://localhost:3000. Good for quick local testing without signing up for anything.

---

## Set up the tip jar (2 minutes, no code)
Paste your link into `TIP_URL` near the top of `index.html`:
- **Stripe Payment Link** — https://dashboard.stripe.com/payment-links (you keep ~97%)
- **Ko-fi** — https://ko-fi.com   ·   **Buy Me a Coffee** — https://buymeacoffee.com

The "☕ Tip the dev" button opens that link. That's your Phase 1 revenue — no accounts.

---

## Files
- `index.html` — the whole app (map centered on you, 50nm radius, GPS + airport search,
  METAR/TAF list, tip jar). Set `PROXY_BASE` and `TIP_URL` here.
- `worker.js` — the Cloudflare Worker proxy (Option A).
- `server.js` — zero-dependency local server + proxy (Option B).
- `manifest.webmanifest`, `sw.js`, `icon-192/512.png` — installable-PWA bits.

## Seeing your edits (cache tip)
The service worker caches the app so it can install/work offline. While developing, if a
change doesn't show up, open the page in a **private/incognito window** or do a hard refresh
(hold Shift + click reload). The cache version is bumped in `sw.js` when files change.

## Notes for a public, money-making app
- Keep the "not an official briefing" disclaimer visible (it's in the footer).
- Put a real contact email in the `User-Agent` line of `worker.js` (AWC guidance).
- The worker includes a light 60-second edge cache, which keeps you well under AWC's
  ~100 requests/min even as more pilots use it.

## What's next (Phase 2+)
Accounts, weather alerts, and a small subscription on top of the tip jar. The code is
structured so those slot in without a rewrite.
