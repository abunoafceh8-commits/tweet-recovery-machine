/* AbuNawaf hardened — © 2026 أبو نواف · MIT */
const __RL = new Map();
function __rate(req, res, max = 90, win = 60_000) {
  try {
    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || (req.socket && req.socket.remoteAddress) || 'x';
    const key = ip + ':' + (req.url || '');
    const now = Date.now();
    const b = __RL.get(key);
    if (!b || now > b.r) { __RL.set(key, { n: 1, r: now + win }); if (__RL.size > 4000) __RL.clear(); return true; }
    b.n++;
    if (b.n > max) { res.setHeader('Retry-After', String(Math.ceil((b.r - now) / 1000))); res.status(429).json({ error: 'rate_limited', message: 'تم تجاوز الحد المسموح — أعد المحاولة بعد قليل' }); return false; }
    return true;
  } catch { return true; }
}
const __origin = (req) => {
  const o = req.headers.origin || '';
  if (!o) return '*';
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o)) return o;
  if (/^https?:\/\/[a-z0-9-]+\.(vercel|arcada)\.app$/.test(o)) return o;
  try { if (o === 'https://' + req.headers.host) return o; } catch {}
  return 'null';
};

export default async function handler(req, res) {
  __ABUNAWAF_HARDENED__: if (!__rate(req, res)) return;
  res.setHeader('Access-Control-Allow-Origin', __origin(req)); res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const body = req.method === 'POST' ? (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}) : {};
  const username = (body.username || req.query?.username || '').replace('@', '').trim();
  const limit = parseInt(body.limit || req.query?.limit || 100);
  
  if (!username) return res.status(400).json({ error: 'Username required' });

  // Run all searches in parallel
  const [live, wayback1, wayback2, nitter] = await Promise.allSettled([
    searchSyndication(username),
    searchWayback(username, 'twitter.com', limit),
    searchWayback(username, 'x.com', limit),
    searchGoogleCache(username)
  ]);

  const allTweets = [
    ...(live.status === 'fulfilled' ? live.value : []),
    ...(wayback1.status === 'fulfilled' ? wayback1.value : []),
    ...(wayback2.status === 'fulfilled' ? wayback2.value : []),
    ...(nitter.status === 'fulfilled' ? nitter.value : [])
  ];

  // Deduplicate by tweet_id
  const seen = new Set();
  const tweets = allTweets.filter(t => {
    if (seen.has(t.tweet_id)) return false;
    seen.add(t.tweet_id);
    return true;
  }).sort((a, b) => (b.formatted_date || '').localeCompare(a.formatted_date || ''));

  res.json({
    tweets: tweets.slice(0, limit),
    summary: {
      total: tweets.length,
      live: live.status === 'fulfilled' ? live.value.length : 0,
      archived: (wayback1.status === 'fulfilled' ? wayback1.value.length : 0) + (wayback2.status === 'fulfilled' ? wayback2.value.length : 0),
      nitter: nitter.status === 'fulfilled' ? nitter.value.length : 0
    },
    username,
    timestamp: new Date().toISOString()
  });
}
