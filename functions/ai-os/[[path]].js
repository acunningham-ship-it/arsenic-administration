// /ai-os — password-gated reverse proxy to Armani's AI-OS (Tailscale Funnel).
// Chrome shows a native Basic-Auth popup the first time (browser caches it after).
// The same password auto-logs into the AI-OS, so it's a single sign-in. Password is
// never stored here — only its SHA-256 hash.

const AIOS = "https://ac-ham-1.taild48c94.ts.net:8443";
const PASS_HASH = "841f67a3492925a004a548aeb91089af07fdb9274c9c5fd2cfdc11f5859c5c70";

async function sha256hex(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function stripPrefix(pathname) {
  let p = pathname.replace(/^\/ai-os/, "");
  return p === "" ? "/" : p;
}

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  // WebSocket upgrade: gated by the session cookie/token (forwarded), not Basic-Auth (browsers don't send it on WS)
  if ((request.headers.get("Upgrade") || "").toLowerCase() === "websocket") {
    const wt = AIOS + stripPrefix(url.pathname) + url.search;
    return fetch(wt, request);
  }

  // Basic-Auth gate (native Chrome popup)
  const auth = request.headers.get("Authorization") || "";
  let password = null;
  if (auth.startsWith("Basic ")) {
    try { const d = atob(auth.slice(6)); password = d.slice(d.indexOf(":") + 1); } catch (e) {}
  }
  if (!password || (await sha256hex(password)) !== PASS_HASH) {
    return new Response("Authentication required.", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="Armani AI-OS", charset="UTF-8"', "Content-Type": "text/plain" },
    });
  }

  // Ensure an AI-OS session (auto-login with the same password) if the browser has none yet
  const incomingCookies = request.headers.get("Cookie") || "";
  let session = "";
  if (!/ropen_session=/.test(incomingCookies)) {
    try {
      const lr = await fetch(AIOS + "/api/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }),
      });
      const sc = (lr.headers.getSetCookie ? lr.headers.getSetCookie().join("; ") : (lr.headers.get("Set-Cookie") || ""));
      const m = sc.match(/ropen_session=([^;]+)/);
      if (m) session = m[1];
    } catch (e) {}
  }

  // Proxy the request
  const target = AIOS + stripPrefix(url.pathname) + url.search;
  const h = new Headers(request.headers);
  h.delete("Authorization");
  h.delete("Host");
  if (session) h.set("Cookie", (incomingCookies ? incomingCookies + "; " : "") + "ropen_session=" + session);
  const init = { method: request.method, headers: h, redirect: "manual" };
  if (!["GET", "HEAD"].includes(request.method)) init.body = request.body;

  let up;
  try { up = await fetch(target, init); }
  catch (e) { return new Response("AI-OS unreachable: " + e, { status: 502 }); }

  const ct = (up.headers.get("content-type") || "").toLowerCase();
  const out = new Headers(up.headers);

  // rewrite Set-Cookie (scope to /ai-os, drop upstream Domain)
  out.delete("Set-Cookie");
  const setc = up.headers.getSetCookie ? up.headers.getSetCookie() : [];
  for (const c of setc) out.append("Set-Cookie", c.replace(/;\s*Domain=[^;]+/i, "").replace(/Path=[^;]*/i, "Path=/ai-os"));
  if (session && setc.length === 0) out.append("Set-Cookie", `ropen_session=${session}; Path=/ai-os; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`);

  // rewrite redirects
  const loc = up.headers.get("Location");
  if (loc) {
    let nl = loc.replace(AIOS, "");
    if (nl.startsWith("/") && !nl.startsWith("/ai-os")) nl = "/ai-os" + nl;
    out.set("Location", nl);
  }

  // rewrite absolute paths in text bodies so the SPA works under /ai-os
  if (/html|javascript|json|css|text|svg/.test(ct)) {
    let body = await up.text();
    body = body
      .split('"/static').join('"/ai-os/static').split("'/static").join("'/ai-os/static")
      .split('"/api').join('"/ai-os/api').split("'/api").join("'/ai-os/api")
      .split("(`/api").join("(`/ai-os/api")
      .split("/ws?token").join("/ai-os/ws?token").split("}/ws").join("}/ai-os/ws");
    return new Response(body, { status: up.status, statusText: up.statusText, headers: out });
  }
  return new Response(up.body, { status: up.status, statusText: up.statusText, headers: out });
}
