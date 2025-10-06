// Kakao Local REST proxy
// Env: KAKAO_REST_API
// GET /api/kakao-local?name=...&address=...&x=...&y=...

function normalize(str) {
  return (str || '').toString().replace(/\s+/g, ' ').trim();
}

function extractBaseAddress(addr) {
  const a = normalize(addr);
  return a.split(',')[0];
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method Not Allowed' });

  const key = process.env.KAKAO_REST_API;
  if (!key) return res.status(200).json({ ok: false, error: 'KAKAO_REST_API not set' });

  const { name = '', address = '', x, y } = req.query || {};
  const baseAddr = extractBaseAddress(address);
  const query = normalize(`${name} ${baseAddr}`);
  if (!query) return res.status(400).json({ ok: false, error: 'Missing query' });

  const params = new URLSearchParams({ query, size: '10' });
  if (x && y) {
    params.set('x', `${x}`);
    params.set('y', `${y}`);
    params.set('radius', '200'); // tighter radius to disambiguate close places
  }

  try {
    const r = await fetch(`https://dapi.kakao.com/v2/local/search/keyword.json?${params.toString()}`, {
      headers: { Authorization: `KakaoAK ${key}` },
    });
    if (!r.ok) return res.status(r.status).json({ ok: false, error: `kakao ${r.status}` });
    const data = await r.json();
    const docs = Array.isArray(data.documents) ? data.documents : [];
    if (!docs.length) return res.status(200).json({ ok: false });
    // Scoring: PM9 boost + name similarity (Dice on bigrams + contains) + address containment + distance
    const base = normalize(baseAddr);
    const targetName = normalize(name);

    const toBigrams = (s) => {
      const t = (s || '').replace(/\s+/g, '');
      const out = [];
      for (let i = 0; i < t.length - 1; i++) out.push(t.slice(i, i + 2));
      return out;
    };
    const dice = (a, b) => {
      const A = toBigrams(a), B = toBigrams(b);
      if (!A.length || !B.length) return 0;
      const map = new Map();
      A.forEach(x => map.set(x, (map.get(x) || 0) + 1));
      let inter = 0;
      B.forEach(x => { const c = map.get(x); if (c) { inter++; map.set(x, c - 1); } });
      return (2 * inter) / (A.length + B.length);
    };

    const scored = docs.map(d => {
      const isPharmacy = (d.category_group_code || '') === 'PM9';
      const nm = normalize(d.place_name);
      const adr = normalize(d.road_address_name || d.address_name || '');
      const contains = targetName && (nm.includes(targetName) || targetName.includes(nm));
      const nameSim = dice(targetName, nm);
      const nameScore = (contains ? 0.6 : 0) + nameSim; // 0~1.6
      const addrScore = base && (adr.includes(base) || base.includes(adr)) ? 1.0 : 0; // 0 or 1
      const distance = parseInt(d.distance || '0', 10) || 0; // meters if x/y provided
      const distPenalty = Math.min(distance / 50, 6); // up to -6
      const pri = (isPharmacy ? 8 : 0) + nameScore * 4 + addrScore * 2 - distPenalty;
      return { d, pri };
    }).sort((a, b) => b.pri - a.pri);

    const best = scored[0].d;
    const placeId = best.id;
    const placeUrl = `https://place.map.kakao.com/${placeId}`;
    res.status(200).json({ ok: true, placeId, placeUrl, x: best.x, y: best.y, name: best.place_name, address: best.road_address_name || best.address_name });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'proxy error' });
  }
};


