export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const { url } = body;
  if (!url) return res.status(400).json({ error: 'URL required' });

  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(15000),
      redirect: 'follow'
    });
    const html = await r.text();

    // Extract tweet content
    const tweetMatch = html.match(/tweet-text[^>]*>([\s\S]*?)<\/p>/i) || 
                       html.match(/TweetTextSize[^>]*>([\s\S]*?)<\/p>/i) ||
                       html.match(/data-testid="tweetText"[^>]*>([\s\S]*?)<\/div>/i);
    const dateMatch = html.match(/title="(\d{1,2}:\d{2}\s*(AM|PM)\s*-\s*\w+\s+\d+,?\s+\d{4})"/i);
    const authorMatch = html.match(/fullname[^>]*>([\s\S]*?)<\/a>/i) || html.match(/<b[^>]*>([\s\S]*?)<\/b>/);

    res.json({
      data: {
        text: tweetMatch?.[1]?.replace(/<[^>]+>/g, '').trim() || 'Could not extract content',
        author: authorMatch?.[1]?.trim() || '',
        date: dateMatch?.[1] || '',
        source: 'wayback_machine'
      },
      url,
      status: r.status
    });
  } catch (e) {
    res.json({ error: e.message, data: { text: '', author: '', date: '' } });
  }
}
