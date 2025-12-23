// worker/src/index.ts

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Allow your GitHub Pages origins.
    // Note: Some embedded webviews may send Origin: null.
    const allowedOrigins = new Set([
      "https://negroni.work",
      "https://www.negroni.work",
      "null",
    ]);

    function corsHeaders(req: Request) {
      const origin = req.headers.get("Origin") ?? "";
      const requestedHeaders =
        req.headers.get("Access-Control-Request-Headers") ?? "Content-Type";

      const allowOrigin = allowedOrigins.has(origin)
        ? origin
        : "https://negroni.work";

      return {
        "Access-Control-Allow-Origin": allowOrigin,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": requestedHeaders,
        "Access-Control-Max-Age": "86400",
        Vary: "Origin, Access-Control-Request-Headers",
      };
    }

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    // Health check
    if (request.method === "GET" && url.pathname === "/health") {
      return new Response("ok", { status: 200 });
    }

    // Echo endpoint: expects multipart/form-data with a "file" field
    if (request.method === "POST" && url.pathname === "/echo") {
      const ct = request.headers.get("Content-Type") || "";
      if (!ct.toLowerCase().includes("multipart/form-data")) {
        return new Response("Expected multipart/form-data", {
          status: 400,
          headers: corsHeaders(request),
        });
      }

      const form = await request.formData();
      const file = form.get("file");

      if (!(file instanceof File)) {
        return new Response('Missing "file" in form-data', {
          status: 400,
          headers: corsHeaders(request),
        });
      }

      // Safety limit (increase if you want)
      const MAX_BYTES = 25 * 1024 * 1024; // 25 MB
      if (file.size > MAX_BYTES) {
        return new Response(`File too large (max ${MAX_BYTES} bytes)`, {
          status: 413,
          headers: corsHeaders(request),
        });
      }

      const buf = await file.arrayBuffer();

      return new Response(buf, {
        status: 200,
        headers: {
          ...corsHeaders(request),
          "Content-Type": file.type || "application/octet-stream",
          // Debug (optional):
          "X-File-Name": encodeURIComponent(file.name || "upload"),
          "X-File-Size": String(file.size),
        },
      });
    }

    return new Response("Not found", { status: 404 });
  },
};
