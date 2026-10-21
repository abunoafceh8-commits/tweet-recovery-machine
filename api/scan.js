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

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function searchWayback(username, domain, limit) {
  const tweets = [];
  try {
    const r = await fetch(`https://web.archive.org/cdx/search/cdx?url=${domain}/${username}/status/*&output=json&limit=${limit}&fl=timestamp,original,statuscode&collapse=urlkey&statuscode=200`, {
      headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000)
    });
    const data = await r.json();
    const [, ...rows] = data;
    rows.forEach(row => {
      const tid = row[1]?.match(/\/status\/(\d+)/)?.[1];
      if (tid) {
        tweets.push({
          tweet_id: tid,
          original_url: row[1],
          archived_url: `https://web.archive.org/web/${row[0]}/${row[1]}`,
          formatted_date: `${row[0].slice(0,4)}-${row[0].slice(4,6)}-${row[0].slice(6,8)}`,
          source: 'Wayback Machine',
          confidence: 0.9,
          data: { author: username, timestamp: row[0] }
        });
      }
    });
  } catch {}
  return tweets;
}

async function searchSyndication(username) {
  const tweets = [];
  try {
    const r = await fetch(`https://syndication.twitter.com/srv/timeline-profile/screen-name/${username}`, {
      headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10000)
    });
    const html = await r.text();
    const ids = [...html.matchAll(/data-tweet-id="(\d+)"/g)];
    const texts = [...html.matchAll(/<p[^>]*dir="ltr"[^>]*>([\s\S]*?)<\/p>/g)];
    
    ids.forEach((m, i) => {
      const text = texts[i]?.[2]?.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim() || '';
      const tid = m[1];
      const epoch = parseInt(tid) / 4194304 + 1288834974657;
      const date = new Date(epoch);
      tweets.push({
        tweet_id: tid,
        original_url: `https://twitter.com/${username}/status/${tid}`,
        archived_url: null,
        formatted_date: date.toISOString().split('T')[0],
        source: 'Live (Syndication)',
        confidence: 1.0,
        data: { text, author: username, timestamp: date.toISOString() }
      });
    });
  } catch {}
  return tweets;
}

async function searchGoogleCache(username) {
  const tweets = [];
  // Google cache search via Nitter
  const nitters = ['https://nitter.net', 'https://nitter.privacydev.net'];
  for (const nitter of nitters) {
    try {
      const r = await fetch(`${nitter}/${username}`, {
        headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000)
      });
      const html = await r.text();
      const links = [...html.matchAll(/href="\/'${username}\/status\/(\d+)"/g)];
      links.forEach(m => {
        const tid = m[1];
        if (!tweets.find(t => t.tweet_id === tid)) {
          tweets.push({
            tweet_id: tid,
            original_url: `https://twitter.com/${username}/status/${tid}`,
            archived_url: `${nitter}/${username}/status/${tid}`,
            formatted_date: '',
            source: 'Nitter',
            confidence: 0.7,
            data: { author: username }
          });
        }
      });
      if (tweets.length > 0) break;
    } catch {}
  }
  return tweets;
}

export default async function handler(req, res) {
  if (!__rate(req, res)) return;
  res.setHeader('Access-Control-Allow-Origin', __origin(req));
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
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
