// rom-archive-api — Cloudflare Worker.
//
// Purpose: the 3DS SSL module only speaks legacy RSA/CBC ciphers, so it cannot
// TLS-handshake with modern hosts (Vercel, and archive.org's data nodes). This
// Worker fetches over HTTPS server-side and re-serves over plain HTTP, so the
// console never performs the impossible handshake.
//
// Routes:
//   /dl?u=<https://archive.org/download/... URL>
//     Streams a ROM file. archive.org's /download/ 302-redirects to a
//     modern-cipher-only data node; we follow that redirect here and stream the
//     bytes back over HTTP. `u` is strictly validated to an archive.org
//     download URL so this is not an open proxy.
//
//   everything else
//     Transparent pass-through to https://rom-archive.vercel.app (the API +
//     site: /api/catalog, /api/item, /api/plan, /api/resolve, etc.).
//
// Kept in the repo so it is version-controlled; deployed to the
// "rom-archive-api" Worker.

const VERCEL_ORIGIN = "https://rom-archive.vercel.app";
const DL_ALLOWED_HOST = "archive.org";
const DL_ALLOWED_PREFIX = "/download/";

function validateDlTarget(raw) {
  let target;
  try {
    target = new URL(raw);
  } catch {
    return null;
  }
  if (target.protocol !== "https:") return null;
  if (target.hostname !== DL_ALLOWED_HOST) return null;
  if (!target.pathname.startsWith(DL_ALLOWED_PREFIX)) return null;
  return target;
}

async function handleDownload(request, url) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("method not allowed\n", {
      status: 405,
      headers: { allow: "GET, HEAD", "content-type": "text/plain; charset=utf-8" },
    });
  }
  const raw = url.searchParams.get("u");
  if (!raw) {
    return new Response("missing ?u= target\n", {
      status: 400,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  const target = validateDlTarget(raw);
  if (!target) {
    return new Response("target must be an https://archive.org/download/ URL\n", {
      status: 400,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  let upstream;
  try {
    upstream = await fetch(target.toString(), {
      method: request.method === "HEAD" ? "HEAD" : "GET",
      redirect: "follow",
      headers: { "user-agent": "rom-archive-dl/1 (+3ds proxy)" },
    });
  } catch (e) {
    return new Response("upstream fetch failed: " + String(e) + "\n", {
      status: 502,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  if (!upstream.ok) {
    return new Response("upstream returned " + upstream.status + "\n", {
      status: upstream.status === 404 ? 404 : 502,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const headers = new Headers();
  headers.set("content-type", "application/octet-stream");
  const len = upstream.headers.get("content-length");
  if (len) headers.set("content-length", len);
  headers.set("cache-control", "no-store");
  return new Response(upstream.body, { status: 200, headers });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/dl") {
      return handleDownload(request, url);
    }

    // Transparent pass-through to the Vercel origin (API + site) over HTTPS,
    // re-served over plain HTTP for the console.
    const upstream = VERCEL_ORIGIN + url.pathname + url.search;
    const init = { method: request.method, headers: {}, redirect: "follow" };
    const ct = request.headers.get("content-type");
    if (ct) init.headers["content-type"] = ct;
    if (request.method !== "GET" && request.method !== "HEAD") {
      init.body = await request.arrayBuffer();
    }
    const resp = await fetch(upstream, init);
    const headers = new Headers();
    const rct = resp.headers.get("content-type");
    if (rct) headers.set("content-type", rct);
    return new Response(resp.body, { status: resp.status, headers });
  },
};
