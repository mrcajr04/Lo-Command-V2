import crypto from 'crypto';

export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email and password are required.' });
  }

  const validEmail = process.env.ADMIN_EMAIL;
  const validPassword = process.env.ADMIN_PASSWORD;
  const secret = process.env.SESSION_SECRET;

  if (!validEmail || !validPassword || !secret) {
    console.error('Missing required environment variables: ADMIN_EMAIL, ADMIN_PASSWORD, SESSION_SECRET');
    return res.status(500).json({ success: false, error: 'Server configuration error.' });
  }

  if (email === validEmail && password === validPassword) {
    const token = crypto
      .createHmac('sha256', secret)
      .update(`${email}:authenticated`)
      .digest('hex');
    return res.status(200).json({ success: true, token });
  }

  return res.status(401).json({ success: false, error: 'Invalid email or password.' });
}
