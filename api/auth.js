import crypto from 'crypto';

export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email and password are required.' });
  }

  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    console.error('Missing SESSION_SECRET environment variable');
    return res.status(500).json({ success: false, error: 'Server configuration error.' });
  }

  // Support multiple users via USERS env var (JSON array)
  // Format: [{"email":"a@b.com","password":"pass1"},{"email":"c@d.com","password":"pass2"}]
  // Falls back to legacy ADMIN_EMAIL / ADMIN_PASSWORD if USERS is not set
  let users = [];
  if (process.env.USERS) {
    try {
      users = JSON.parse(process.env.USERS);
    } catch {
      console.error('USERS env var is not valid JSON');
      return res.status(500).json({ success: false, error: 'Server configuration error.' });
    }
  } else if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    users = [{ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }];
  }

  const match = users.find(u => u.email === email && u.password === password);

  if (match) {
    const token = crypto
      .createHmac('sha256', secret)
      .update(`${email}:authenticated`)
      .digest('hex');
    return res.status(200).json({ success: true, token });
  }

  return res.status(401).json({ success: false, error: 'Invalid email or password.' });
}
