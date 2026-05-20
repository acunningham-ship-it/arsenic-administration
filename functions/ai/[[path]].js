// Cloudflare Pages Function: proxies arsenicadministration.org/ai/* to OpenRouter.
// Secrets (set in Cloudflare Pages dashboard → Settings → Environment variables):
//   OPENROUTER_API_KEY  - your OpenRouter key (encrypted)
//   PROXY_SHARED_SECRET - any random string; client must send it as X-Proxy-Key

const UPSTREAM = "https://openrouter.ai/api/v1";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Proxy-Key, HTTP-Referer, X-Title",
  "Access-Control-Max-Age": "86400",
};

export async function onRequest(context) {
  const { request, env, params } = context;

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  const bearer = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const proxyKey = request.headers.get("X-Proxy-Key") || bearer;
  if (proxyKey !== env.PROXY_SHARED_SECRET) {
    return json({ error: "unauthorized" }, 401);
  }

  if (!env.OPENROUTER_API_KEY) {
    return json({ error: "server missing OPENROUTER_API_KEY" }, 500);
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
  for (const [k, v] of Object.entries(CORS)) respHeaders.set(k, v);

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

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}
