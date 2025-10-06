// Simple serverless function to proxy Naver Local Search API securely
// Env vars: NAVER_CLIENT_ID, NAVER_CLIENT_SECRET
// GET /api/naver-local?name=...&address=...

const CACHE_TTL_MS = 1000 * 60 * 60 * 6; // 6 hours
const cache = new Map(); // key -> { value, expires }

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'Method Not Allowed' });
    return;
  }
  const { name = '', address = '' } = req.query || {};
  const qRaw = `${name} ${address}`.trim();
  if (!qRaw) {
    res.status(400).json({ ok: false, error: 'Missing name/address' });
    return;
  }
  const q = qRaw.replace(/\s+/g, ' ');
  const cacheKey = q.toLowerCase();
  const now = Date.now();
  const hit = cache.get(cacheKey);
  if (hit && hit.expires > now) {
    res.status(200).json(hit.value);
    return;
  }

  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    res.status(500).json({ ok: false, error: 'NAVER credentials not configured' });
    return;
  }

  try {
    const params = new URLSearchParams({
      query: q,
      display: '1',
      start: '1',
      sort: 'random'
    });
    const apiUrl = `https://openapi.naver.com/v1/search/local.json?${params.toString()}`;
    const r = await fetch(apiUrl, {
      headers: {
        'X-Naver-Client-Id': clientId,
        'X-Naver-Client-Secret': clientSecret
      }
    });
    if (!r.ok) {
      res.status(r.status).json({ ok: false, error: `Naver API error ${r.status}` });
      return;
    }
    const data = await r.json();
    const first = Array.isArray(data.items) && data.items.length ? data.items[0] : null;
    const result = first ? {
      ok: true,
      title: first.title,
      link: first.link || null,
      category: first.category || null,
      address: first.address || null,
      roadAddress: first.roadAddress || null,
      mapx: first.mapx || null,
      mapy: first.mapy || null
    } : { ok: false };
    cache.set(cacheKey, { value: result, expires: now + CACHE_TTL_MS });
    res.status(200).json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: 'Proxy error' });
  }
};


