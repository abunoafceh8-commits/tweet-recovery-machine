export default async function handler(req, res) {
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const { username, url } = body;
  const target = username || url;
  if (!target) return res.status(400).json({ error: 'Username or URL required' });
  
  const cleanUser = target.replace(/^@/, '').replace(/https?:\/\/(www\.)?(twitter|x)\.com\//, '').split('/')[0];
  const tweets = [];

  try {
    // Method 1: Syndication API (fast)
    try {
      const r = await fetch(`https://syndication.twitter.com/srv/timeline-profile/screen-name/${cleanUser}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
        signal: AbortSignal.timeout(8000)
      });
      const html = await r.text();
      // Extract tweet IDs and text
      const idMatches = [...html.matchAll(/data-tweet-id="(\d+)"/g)];
      const textBlocks = html.match(/<p[^>]*dir="ltr"[^>]*>([\s\S]*?)<\/p>/g) || [];
      
      idMatches.forEach((m, i) => {
        const text = textBlocks[i]?.replace(/<[^>]+>/g, '').trim() || '';
        tweets.push({
          tweetId: m[1],
          text,
          originalUrl: `https://twitter.com/${cleanUser}/status/${m[1]}`,
          archiveUrl: `https://web.archive.org/web/2/${m[1]}`,
          date: null,
          source: 'syndication'
        });
      });
    } catch (e) {
      // Syndication failed, continue
    }

    // Method 2: Wayback availability check (quick)
    try {
      const wb = await fetch(`https://archive.org/wayback/available?url=twitter.com/${cleanUser}`, {
        signal: AbortSignal.timeout(5000)
      });
      const wbd = await wb.json();
      if (wbd.archived_snapshots?.closest) {
        tweets.unshift({
          tweetId: 'profile_archive',
          text: 'Profile archived',
          originalUrl: wbd.archived_snapshots.closest.url,
          archiveUrl: wbd.archived_snapshots.closest.url,
          date: wbd.archived_snapshots.closest.timestamp,
          source: 'wayback_profile',
          status: wbd.archived_snapshots.closest.status
        });
      }
    } catch {}

    // Method 3: Try Google cache search via alternative
    try {
      const gc = await fetch(`https://webcache.googleusercontent.com/search?q=cache:twitter.com/${cleanUser}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(5000),
        redirect: 'follow'
      });
      if (gc.ok) {
        tweets.unshift({
          tweetId: 'google_cache',
          text: 'Google Cache available',
          archiveUrl: gc.url,
          source: 'google_cache'
        });
      }
    } catch {}

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.json({ username: cleanUser, tweets, total: tweets.length });
  } catch (e) {
    return res.json({ error: e.message, username: cleanUser, tweets, total: tweets.length });
  }
}
