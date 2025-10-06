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
  console.info('[kakao-proxy] incoming', { name, baseAddr, x, y, query });
  if (!query) return res.status(400).json({ ok: false, error: 'Missing query' });

  const params = new URLSearchParams({ query, size: '10' });
  if (x && y) {
    params.set('x', `${x}`);
    params.set('y', `${y}`);
    params.set('radius', '200'); // tighter radius to disambiguate close places
  }

  try {
    // 1) PM9 카테고리(약국) 우선: 좌표 반경에서 거리순
    async function catSearch(radius) {
      const p = new URLSearchParams({
        category_group_code: 'PM9',
        x: `${x || ''}`,
        y: `${y || ''}`,
        radius: `${radius}`,
        size: '15',
        sort: 'distance'
      });
      const url = `https://dapi.kakao.com/v2/local/search/category.json?${p.toString()}`;
      const rr = await fetch(url, { headers: { Authorization: `KakaoAK ${key}` } });
      if (!rr.ok) return [];
      const jd = await rr.json();
      return Array.isArray(jd.documents) ? jd.documents : [];
    }

    // 2) 키워드 보완: x/y와 함께 좁은 반경 → 그 다음 이름+주소 → 마지막 넓힌 반경
    async function kwSearch(q, rad) {
      const p = new URLSearchParams({ query: q, size: '10' });
      if (x && y && rad) { p.set('x', `${x}`); p.set('y', `${y}`); p.set('radius', `${rad}`); }
      const url = `https://dapi.kakao.com/v2/local/search/keyword.json?${p.toString()}`;
      const rr = await fetch(url, { headers: { Authorization: `KakaoAK ${key}` } });
      if (!rr.ok) return [];
      const jd = await rr.json();
      return Array.isArray(jd.documents) ? jd.documents : [];
    }

    let docs = [];
    if (x && y) {
      docs = await catSearch(200);
      if (!docs.length) docs = await catSearch(500);
    }
    if (!docs.length) {
      // 상호명만 먼저 (잡음 감소) → 없으면 이름+주소 → 그래도 없으면 반경 확대
      docs = await kwSearch(targetName || query, x && y ? 300 : undefined);
      if (!docs.length) docs = await kwSearch(query, x && y ? 500 : undefined);
    }
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
    console.info('[kakao-proxy] best', { id: best.id, name: best.place_name, adr: best.road_address_name || best.address_name, distance: best.distance, x: best.x, y: best.y });
    const placeId = best.id;
    const placeUrl = `https://place.map.kakao.com/${placeId}`;
    res.status(200).json({ ok: true, placeId, placeUrl, x: best.x, y: best.y, name: best.place_name, address: best.road_address_name || best.address_name });
  } catch (e) {
    console.error('[kakao-proxy] error', e);
    res.status(500).json({ ok: false, error: 'proxy error' });
  }
};


