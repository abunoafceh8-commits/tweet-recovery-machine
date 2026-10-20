export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const { url } = body;
  if (!url) return res.status(400).json({ error: 'URL required' });

  try {
    const r = await fetch('https://tweet-recovery-machine-o1p3.arcada.app/api/fetch-archive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(30000)
    });
    const data = await r.json();
    return res.json(data);
  } catch (e) {
    return res.json({ error: e.message, data: { text: '', author: '' } });
  }
}
