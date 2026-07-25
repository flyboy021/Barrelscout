// Cloudflare Worker — the one-time, free proxy that lets the static app reach
// the weather service from any origin (file://, GitHub Pages, anywhere).
//
// Deploy: https://workers.cloudflare.com  ->  Create Worker  ->  paste this  ->
// Deploy. Copy the worker URL (e.g. https://wx-proxy.you.workers.dev) into
// PROXY_BASE in index.html. After that you never run a local server.

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS preflight (harmless to support).
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    // AI weather briefing summary. The Anthropic API key is kept server-side as
    // the ANTHROPIC_API_KEY Worker secret, never in the app or on GitHub.
    if (url.pathname === "/api/summarize" && request.method === "POST") {
      const key = env && env.ANTHROPIC_API_KEY;
      if (!key) {
        return new Response(JSON.stringify({ error: "AI summary is not configured on the server." }), {
          status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }
      let body;
      try { body = await request.json(); } catch (e) { body = {}; }
      const prompt = String((body && body.prompt) || "").slice(0, 12000);
      if (!prompt) {
        return new Response(JSON.stringify({ error: "Missing prompt" }), {
          status: 400, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }
      try {
        const up = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-haiku-4-5",
            max_tokens: 500,
            system: "You are a concise VFR/IFR aviation weather briefer speaking to a general aviation pilot. " +
              "Summarize the given METAR/TAF data in plain spoken English, organized for reading aloud. " +
              "Lead with the overall picture (VFR/MVFR/IFR/LIFR), then call out notable hazards (low ceilings, " +
              "poor visibility, strong/gusty wind, thunderstorms, icing, IFR trends). Keep it under 150 words, " +
              "use short sentences, and avoid raw METAR/TAF jargon codes. Refer to airports by their spoken " +
              "name (e.g. \"Wichita\" instead of \"KICT\") whenever a name is given in the data; only fall back " +
              "to spelling out the identifier if no name is available. Write in plain prose only — no markdown, " +
              "no asterisks, no bullet points, no headers — since this is read aloud as speech. End with a " +
              "one-line reminder that this is not an official weather briefing.",
            messages: [{ role: "user", content: prompt }],
          }),
        });
        const data = await up.json();
        if (!up.ok) {
          const msg = (data && data.error && data.error.message) || "AI service error";
          return new Response(JSON.stringify({ error: msg }), {
            status: up.status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
          });
        }
        const text = (data.content || []).map(c => c.text || "").join("").trim();
        return new Response(JSON.stringify({ summary: text }), {
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: "AI service unreachable" }), {
          status: 502, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }
    }

    // Synoptic Data (MesoWest) — mountain-pass / RWIS / mesonet stations.
    // The API token is kept server-side as the SYNOPTIC_TOKEN Worker variable,
    // never in the app or on GitHub. The app calls: /synoptic?radius=lat,lon,mi&vars=...
    if (url.pathname.startsWith("/synoptic")) {
      const token = env && env.SYNOPTIC_TOKEN;
      if (!token) {
        return new Response(JSON.stringify({ error: "Synoptic token not configured" }), {
          status: 500,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }
      const qs = new URLSearchParams(url.search);
      qs.set("token", token);
      const target = "https://api.synopticdata.com/v2/stations/latest?" + qs.toString();
      try {
        const up = await fetch(target, {
          headers: { Accept: "application/json" },
          cf: { cacheTtl: 120, cacheEverything: true }, // 2-min edge cache
        });
        const res = new Response(up.body, up);
        res.headers.set("Access-Control-Allow-Origin", "*");
        return res;
      } catch (e) {
        return new Response(JSON.stringify({ error: "synoptic unreachable" }), {
          status: 502,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }
    }

    if (url.pathname.startsWith("/atis/")) {
      const icao = url.pathname.split("/")[2] || "";
      try {
        const up = await fetch("https://datis.clowd.io/api/" + encodeURIComponent(icao),
          { headers: { Accept: "application/json" } });
        const res = new Response(up.body, up);
        res.headers.set("Access-Control-Allow-Origin", "*");
        return res;
      } catch (e) {
        return new Response("[]", { status: 200,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
      }
    }

    if (!url.pathname.startsWith("/api/data/")) {
      return new Response("Wx Radius proxy OK", { status: 200 });
    }

    const target = "https://aviationweather.gov" + url.pathname + url.search;
    let upstream;
    try {
      upstream = await fetch(target, {
        headers: {
          "User-Agent": "WxRadiusApp/1.0 (dehaven.jeremy@gmail.com)",
          Accept: "application/json",
        },
        cf: { cacheTtl: 60, cacheEverything: true }, // light 60s edge cache
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: "weather service unreachable" }), {
        status: 502,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const res = new Response(upstream.body, upstream);
    res.headers.set("Access-Control-Allow-Origin", "*");
    return res;
  },
};
