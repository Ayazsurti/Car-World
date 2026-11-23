const U = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const T = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

async function redis(cmd) {
  const r = await fetch(U, {
    method: "POST",
    headers: { Authorization: "Bearer " + T },
    body: JSON.stringify(cmd),
  });
  return (await r.json()).result;
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!U || !T) return res.status(500).json({ error: "storage not connected" });
  try {
    if (req.method === "GET") {
      const rows = (await redis(["LRANGE", "reviews", 0, 29])) || [];
      const out = rows
        .map((s) => { try { return JSON.parse(s); } catch (e) { return null; } })
        .filter(Boolean);
      return res.status(200).json(out);
    }
    if (req.method === "POST") {
      const b = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
      const name = String(b.name || "").trim().slice(0, 60);
      const comment = String(b.comment || "").trim().slice(0, 500);
      const rating = parseInt(b.rating, 10);
      if (!name || !comment || !(rating >= 1 && rating <= 5)) {
        return res.status(400).json({ error: "invalid" });
      }
      const ip = String(req.headers["x-forwarded-for"] || "x").split(",")[0].trim();
      const ok = await redis(["SET", "rl:" + ip, "1", "NX", "EX", "30"]);
      if (!ok) return res.status(429).json({ error: "too fast" });
      await redis(["LPUSH", "reviews", JSON.stringify({ name, rating, comment, t: Date.now() })]);
      await redis(["LTRIM", "reviews", 0, 199]);
      return res.status(200).json({ ok: true });
    }
    return res.status(405).end();
  } catch (e) {
    return res.status(500).json({ error: "server" });
  }
};
