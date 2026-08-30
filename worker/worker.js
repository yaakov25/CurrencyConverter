/* Cloudflare Worker — hält den Twelve-Data-Key geheim.
   Die App ruft:  https://<worker>.workers.dev/?base=CHF&symbols=EUR,USD,GBP
   Antwort:       { "base":"CHF", "rates":{"EUR":1.06,...}, "ts":1756...,"src":"live" }

   Einrichtung (einmalig):
     1. dash.cloudflare.com → Compute (Workers) → Create → Start from Hello World
     2. Diesen Code in den Editor einfügen, Deploy
     3. Worker → Settings → Variables and Secrets → Add:
          Type: Secret,  Name: TD_KEY,  Value: <dein Twelve-Data-Key>
     4. Die *.workers.dev-URL in app.js bei LIVE_URL eintragen
*/

const ALLOW = [
  'https://yaakov25.github.io',
  'http://localhost:8000',
];
const TTL = 60;                       // Sekunden Edge-Cache: bremst versehentliche Schleifen

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': ALLOW.includes(origin) ? origin : ALLOW[0],
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Cache-Control': `public, max-age=${TTL}`,
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    const url = new URL(request.url);
    const base = (url.searchParams.get('base') || 'CHF').toUpperCase().slice(0, 3);
    const symbols = (url.searchParams.get('symbols') || 'EUR')
      .toUpperCase().split(',').map((s) => s.trim().slice(0, 3))
      .filter((s) => /^[A-Z]{3}$/.test(s) && s !== base).slice(0, 12);

    if (!/^[A-Z]{3}$/.test(base) || !symbols.length) {
      return json({ error: 'bad request' }, 400, cors);
    }

    // Ein Aufruf für alle Paare; Twelve Data zählt 1 Credit je Symbol.
    const pairs = symbols.map((s) => `${base}/${s}`).join(',');
    const api = `https://api.twelvedata.com/exchange_rate?symbol=${encodeURIComponent(pairs)}&apikey=${env.TD_KEY}`;

    const cache = caches.default;
    const ck = new Request(url.toString(), request);
    const hit = await cache.match(ck);
    if (hit) return hit;

    let upstream;
    try {
      upstream = await fetch(api, { cf: { cacheTtl: TTL, cacheEverything: true } });
    } catch {
      return json({ error: 'upstream unreachable' }, 502, cors);
    }
    if (!upstream.ok) return json({ error: 'upstream ' + upstream.status }, 502, cors);

    const d = await upstream.json();
    if (d.status === 'error') return json({ error: d.message || 'api error' }, 502, cors);

    // Einzelnes Paar -> flaches Objekt; mehrere -> nach "CHF/EUR" verschlüsselt
    const rates = {};
    if (typeof d.rate === 'number') {
      rates[symbols[0]] = d.rate;
    } else {
      for (const [k, v] of Object.entries(d)) {
        const to = k.split('/')[1];
        if (to && v && typeof v.rate === 'number') rates[to] = v.rate;
      }
    }
    if (!Object.keys(rates).length) return json({ error: 'no rates' }, 502, cors);

    const body = { base, rates, ts: Date.now(), src: 'live' };
    const res = json(body, 200, cors);
    await cache.put(ck, res.clone());
    return res;
  },
};

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}
