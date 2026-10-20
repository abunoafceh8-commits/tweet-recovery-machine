export default async function handler(req, res) {
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  const { url, timestamp } = body;
  if (!url) return res.status(400).json({ error: 'URL required' });
  
  try {
    const archiveUrl = timestamp 
      ? `https://web.archive.org/web/${timestamp}/${url}`
      : url;
    
    const r = await fetch(archiveUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(15000),
      redirect: 'follow'
    });
    const html = await r.text();
    
    // Extract tweet text from archived page
    const tweetMatch = html.match(/tweet-text[^>]*>([\s\S]*?)<\/p>/i) || 
                       html.match(/TweetTextSize[^>]*>([\s\S]*?)<\/p>/i) ||
                       html.match(/data-testid="tweetText"[^>]*>([\s\S]*?)<\/div>/i);
    const dateMatch = html.match(/title="(\d{1,2}:\d{2}\s*(AM|PM)\s*-\s*\w+\s*\d+,?\s*\d{4})"/i);
    const nameMatch = html.match(/fullname[^>]*>([\s\S]*?)<\/a>/i) || html.match(/<b[^>]*>([\s\S]*?)<\/b>/);
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.json({
      url: archiveUrl,
      content: tweetMatch?.[1]?.replace(/<[^>]+>/g, '').trim() || 'Could not extract tweet text',
      date: dateMatch?.[1] || null,
      author: nameMatch?.[1]?.trim() || null,
      html: html.substring(0, 50000)
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
