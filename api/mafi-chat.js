export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { message, history } = req.body || {};

  if (!message) {
    return res.status(400).json({ error: 'Message is required.' });
  }

  try {
    const response = await fetch('https://mlghomefinancial.com/mafi-chat-api.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history: history || [] }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('MAFI API error:', response.status, text);
      return res.status(502).json({ error: 'MAFI API returned an error.' });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (err) {
    console.error('MAFI proxy error:', err);
    return res.status(500).json({ error: 'Failed to reach MAFI API.' });
  }
}
