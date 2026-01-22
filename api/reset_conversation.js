import { getSession } from './_shared.js';

export default function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }

  const session = getSession(req, res);
  session.selected_character = null;
  session.conversation_history = [];

  res.status(200).json({ success: true });
}
