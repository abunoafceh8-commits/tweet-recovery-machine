const saved = [];
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    saved.unshift({ id: Date.now().toString(), ...body, savedAt: new Date().toISOString() });
    if (saved.length > 500) saved.pop();
    return res.json({ success: true });
  }
  if (req.method === 'DELETE') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const idx = saved.findIndex(s => s.id === body.id);
    if (idx >= 0) saved.splice(idx, 1);
    return res.json({ success: true });
  }
  return res.json(saved);
}
