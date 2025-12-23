export default {
  async fetch(request: Request): Promise<Response> {
    const origin = request.headers.get("Origin") || "";

    // Allow your GitHub Pages origins
    const ALLOWED_ORIGINS = new Set([
      "https://negroni.work",
      "https://www.negroni.work",
    ]);

    const corsHeaders = (o: string) => ({
      "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(o) ? o : "https://negroni.work",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    });

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    const url = new URL(request.url);

    // Health check
    if (request.method === "GET" && url.pathname === "/health") {
      return new Response("ok", { status: 200 });
    }

    // Echo endpoint: expects multipart form-data field "file"
    if (request.method === "POST" && url.pathname === "/echo") {
      const ct = request.headers.get("Content-Type") || "";
      if (!ct.toLowerCase().includes("multipart/form-data")) {
        return new Response("Expected multipart/form-data", {
          status: 400,
          headers: corsHeaders(origin),
        });
      }

      const form = await request.formData();
      const file = form.get("file");

      if (!(file instanceof File)) {
        return new Response('Missing "file" in form-data', {
          status: 400,
          headers: corsHeaders(origin),
        });
      }

      // Optional safety limit (e.g., 12MB)
      const MAX_BYTES = 12 * 1024 * 1024;
      if (file.size > MAX_BYTES) {
        return new Response("File too large", {
          status: 413,
          headers: corsHeaders(origin),
        });
      }

      const buf = await file.arrayBuffer();

      return new Response(buf, {
        status: 200,
        headers: {
          ...corsHeaders(origin),
          "Content-Type": file.type || "application/octet-stream",
          // Helpful for debugging:
          "X-File-Name": encodeURIComponent(file.name || "upload"),
          "X-File-Size": String(file.size),
        },
      });
    }

    return new Response("Not found", { status: 404 });
  },
};
