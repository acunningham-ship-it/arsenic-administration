// Cloudflare Pages Function: proxies arsenicadministration.org/ai/* to OpenRouter.
// Secrets (set in Cloudflare Pages dashboard → Settings → Environment variables):
//   OPENROUTER_API_KEY  - your OpenRouter key (encrypted)
//   PROXY_SHARED_SECRET - any random string; client must send it as X-Proxy-Key

const UPSTREAM = "https://openrouter.ai/api/v1";

// Browsers may call this only from our own sites (and localhost for dev). Non-browser clients
// (CLI tools, curl) send no Origin and are unaffected; the shared secret is still the real gate.
const ALLOWED_ORIGIN = /^(https:\/\/([a-z0-9-]+\.)*(arsenicadministration\.org|hamtek\.dev)|http:\/\/localhost(:\d+)?)$/;
const CORS = {
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Proxy-Key, HTTP-Referer, X-Title",
  "Access-Control-Max-Age": "86400",
};

function corsFor(request) {
  const origin = request.headers.get("Origin") || "";
  const h = { ...CORS, Vary: "Origin" };
  if (ALLOWED_ORIGIN.test(origin)) h["Access-Control-Allow-Origin"] = origin;
  return h;
}

// Length-independent compare so response time doesn't leak how much of the secret matched.
function safeEqual(a, b) {
  const enc = new TextEncoder();
  const x = enc.encode(a), y = enc.encode(b);
  let d = x.length ^ y.length;
  for (let i = 0; i < x.length; i++) d |= x[i] ^ (y[i % (y.length || 1)] || 0);
  return d === 0;
}

export async function onRequest(context) {
  const { request, env, params } = context;
  const cors = corsFor(request);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  const bearer = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const proxyKey = request.headers.get("X-Proxy-Key") || bearer;
  if (!env.PROXY_SHARED_SECRET || !safeEqual(proxyKey, env.PROXY_SHARED_SECRET)) {
    return json({ error: "unauthorized" }, 401, cors);
  }

  if (!env.OPENROUTER_API_KEY) {
    return json({ error: "server missing OPENROUTER_API_KEY" }, 500, cors);
  }

  let subpath = Array.isArray(params.path) ? params.path.join("/") : (params.path || "");
  subpath = subpath.replace(/^v1\//, "");
  const url = new URL(request.url);
  const target = `${UPSTREAM}/${subpath}${url.search}`;

  const headers = new Headers(request.headers);
  headers.set("Authorization", `Bearer ${env.OPENROUTER_API_KEY}`);
  headers.delete("X-Proxy-Key");
  headers.delete("host");
  headers.delete("cf-connecting-ip");
  headers.delete("cf-ray");
  if (!headers.has("HTTP-Referer")) headers.set("HTTP-Referer", "https://arsenicadministration.org");
  if (!headers.has("X-Title")) headers.set("X-Title", "Arsenic Administration");

  const upstream = await fetch(target, {
    method: request.method,
    headers,
    body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
  });

  const respHeaders = new Headers(upstream.headers);
  for (const [k, v] of Object.entries(cors)) respHeaders.set(k, v);

  if (subpath === "models" && upstream.ok) {
    const data = await upstream.json();
    if (Array.isArray(data?.data)) {
      data.data = data.data.filter((m) =>
        Array.isArray(m.supported_parameters) && m.supported_parameters.includes("tools")
      );
    }
    respHeaders.set("Content-Type", "application/json");
    return new Response(JSON.stringify(data), { status: upstream.status, headers: respHeaders });
  }

  return new Response(upstream.body, { status: upstream.status, headers: respHeaders });
}

function json(obj, status = 200, cors = CORS) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}
