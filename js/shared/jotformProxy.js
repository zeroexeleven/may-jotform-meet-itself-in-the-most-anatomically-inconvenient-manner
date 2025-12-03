export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    const id = url.searchParams.get("id");
    if (!id) {
      return jsonResponse({ error: "Missing id parameter" }, 400);
    }

    const apiKey = env.JOTFORM_API_KEY;
    if (!apiKey) {
      return jsonResponse({ error: "Missing JOTFORM_API_KEY in env" }, 500);
    }

    const jotUrl = `https://api.jotform.com/submission/${encodeURIComponent(
      id
    )}?apiKey=${encodeURIComponent(apiKey)}`;

    const jotRes = await fetch(jotUrl);
    const jotJson = await jotRes.json().catch(() => null);

    if (!jotRes.ok || !jotJson || jotJson.responseCode !== 200) {
      return jsonResponse(
        {
          error: "Failed to fetch submission from Jotform",
          status: jotRes.status,
          jotformResponse: jotJson || null,
        },
        502
      );
    }

    return jsonResponse(jotJson, 200);
  },
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
