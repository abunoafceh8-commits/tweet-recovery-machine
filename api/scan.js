const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const { username, mode = 'full_scan', limit = 100 } = body;
  if (!username) return res.status(400).json({ error: 'Username required' });

  const cleanUser = username.replace(/^@/, '').trim();
  const tweets = [];

  try {
    // Syndication API for live tweets
    try {
      const r = await fetch(`https://syndication.twitter.com/srv/timeline-profile/screen-name/${cleanUser}`, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(8000)
      });
      const html = await r.text();
      const ids = [...html.matchAll(/data-tweet-id="(\d+)"/g)];
      const texts = [...html.matchAll(/<p[^>]*dir="ltr"[^>]*>([\s\S]*?)<\/p>/g)];
      
      ids.forEach((m, i) => {
        const text = texts[i]?.[2]?.replace(/<[^>]+>/g, '').trim() || '';
        const tweetId = m[1];
        const date = new Date(parseInt(tweetId) / 4194304 + 1288834974657); // Twitter Snowflake ID to timestamp
        
        tweets.push({
          tweet_id: tweetId,
          original_url: `https://twitter.com/${cleanUser}/status/${tweetId}`,
          archived_url: null,
          formatted_date: date.toISOString().split('T')[0],
          source_label: 'Live Tweet',
          confidence: 1.0,
          data: {
            text,
            author: cleanUser,
            source: 'twitter_syndication',
            captured_at: new Date().toISOString(),
            confidence: 1.0,
            media: [],
            title: text.slice(0, 50)
          }
        });
      });
    } catch {}

    // Wayback CDX for archived tweets
    for (const domain of ['twitter.com', 'x.com']) {
      try {
        const r = await fetch(`https://web.archive.org/cdx/search/cdx?url=${domain}/${cleanUser}/status/*&output=json&limit=${limit}&fl=timestamp,original,statuscode&collapse=urlkey&statuscode=200`, {
          signal: AbortSignal.timeout(8000)
        });
        const data = await r.json();
        const [, ...rows] = data;
        
        rows.forEach(row => {
          const tid = row[1]?.match(/\/status\/(\d+)/)?.[1];
          if (tid && !tweets.find(t => t.tweet_id === tid)) {
            const formattedDate = `${row[0].slice(0,4)}-${row[0].slice(4,6)}-${row[0].slice(6,8)}`;
            tweets.push({
              tweet_id: tid,
              original_url: row[1],
              archived_url: `https://web.archive.org/web/${row[0]}/${row[1]}`,
              formatted_date: formattedDate,
              source_label: `Wayback (${domain})`,
              confidence: 0.85,
              data: {
                text: '',
                author: cleanUser,
                source: 'wayback_machine',
                captured_at: row[0],
                confidence: 0.85,
                media: [],
                title: `Archived tweet from ${formattedDate}`
              }
            });
          }
        });
      } catch {}
    }

    // Sort by date (newest first)
    tweets.sort((a, b) => (b.formatted_date || '').localeCompare(a.formatted_date || ''));

    const highConfidence = tweets.filter(t => t.confidence >= 0.9).length;

    res.json({
      tweets,
      summary: {
        total: tweets.length,
        tweets: tweets.length,
        pages: 1,
        high_confidence: highConfidence
      },
      username: cleanUser,
      mode
    });
  } catch (e) {
    res.json({
      tweets: [],
      summary: { total: 0, tweets: 0, pages: 0, high_confidence: 0 },
      username: cleanUser,
      error: e.message
    });
  }
}
