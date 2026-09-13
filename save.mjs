// Same-origin save proxy for the belief-consistency study.
//
// Why this exists: Google Apps Script serves its responses through a redirected
// googleusercontent.com URL, so a direct browser -> Apps Script POST can fail
// under CORS rules even when the script ran fine. The experiment posts here, on
// its own origin, and this function forwards server-side.
//
// GET  /.netlify/functions/save  -> health check of the configured backend
// POST /.netlify/functions/save  -> forwards the session JSON unchanged
//
// With GOOGLE_SHEET_WEBHOOK unset the function runs in sink mode: it validates
// and confirms the payload without storing it, which is what you want while
// piloting the interface.

const SCHEMA_VERSION = 1;
const FETCH_TIMEOUT_MS = 28_000;
const MAX_BODY_BYTES = 2_000_000;

function upstreamUrl() {
  const configured = typeof process !== "undefined" && process.env ? process.env.GOOGLE_SHEET_WEBHOOK : "";
  return String(configured || "").trim();
}

function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" },
  });
}

async function fetchWithTimeout(url, init) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal, redirect: "follow" });
  } finally {
    clearTimeout(timer);
  }
}

export default async (req) => {
  const method = String(req.method || "GET").toUpperCase();
  const target = upstreamUrl();

  if (method === "GET") {
    if (!target) return json({ status: "success", schema: SCHEMA_VERSION, mode: "sink", service: "belief-study" });
    try {
      const res = await fetchWithTimeout(target, { method: "GET", headers: { Accept: "application/json,text/plain,*/*" }, cache: "no-store" });
      const text = await res.text();
      let parsed = null;
      try { parsed = JSON.parse(text); } catch (_) {}
      if (!res.ok || !parsed) {
        return json({
          status: "error",
          error: "The backend health check did not return JSON. Check that the web app is deployed with access set to Anyone.",
          upstreamHttpStatus: res.status,
          upstreamReply: text.replace(/\s+/g, " ").slice(0, 300),
        }, 502);
      }
      return json({ status: parsed.status || "success", schema: parsed.schema, mode: "proxy", service: parsed.service || null });
    } catch (err) {
      return json({ status: "error", error: "Could not reach the backend: " + String(err?.message || err) }, 502);
    }
  }

  if (method !== "POST") return json({ status: "error", error: "Method not allowed" }, 405);

  let body;
  try { body = await req.text(); } catch (_) {
    return json({ status: "error", error: "Could not read the request body." }, 400);
  }
  if (!body) return json({ status: "error", error: "Empty payload." }, 400);
  if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) {
    return json({ status: "error", error: "Payload is unexpectedly large." }, 400);
  }

  let parsedBody;
  try { parsedBody = JSON.parse(body); } catch (_) {
    return json({ status: "error", error: "Payload is not valid JSON." }, 400);
  }
  if (parsedBody.schema !== SCHEMA_VERSION) {
    return json({
      status: "error",
      error: "Version mismatch: the page sends data format " + parsedBody.schema + " and this endpoint expects " + SCHEMA_VERSION + ".",
      schema: SCHEMA_VERSION,
    }, 400);
  }

  if (!target) {
    console.log("[sink] %s %s %s", parsedBody.stage, parsedBody.subjectId, parsedBody.progressLabel || "");
    return json({ status: "success", schema: SCHEMA_VERSION, mode: "sink" });
  }

  try {
    const res = await fetchWithTimeout(target, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8", Accept: "application/json,text/plain,*/*" },
      body,
      cache: "no-store",
    });
    const text = await res.text();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch (_) {}
    if (!res.ok || !parsed) {
      return json({
        status: "error",
        error: "The backend did not return a readable JSON response. Check its deployment and access settings.",
        upstreamHttpStatus: res.status,
        upstreamReply: text.replace(/\s+/g, " ").slice(0, 500),
      }, 502);
    }
    return json({ ...parsed, proxy: "belief-save" }, parsed.status === "error" ? 502 : 200);
  } catch (err) {
    return json({ status: "error", error: "Could not reach the backend: " + String(err?.message || err) }, 502);
  }
};

export const __test = { upstreamUrl, SCHEMA_VERSION };
