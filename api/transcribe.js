export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    const model = process.env.GEMINI_MODEL ?? 'gemini-2.0-flash';

    if (!apiKey) {
      res.status(500).json({ success: false, error: 'Missing GEMINI_API_KEY in environment.' });
      return;
    }

    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};

    const audio = String(body?.audio ?? '').trim();
    const mimeType = String(body?.mime_type ?? 'audio/webm').trim() || 'audio/webm';
    const lang = String(body?.lang ?? 'Kurdish Sorani').trim() || 'Kurdish Sorani';

    if (!audio) {
      res.status(400).json({ success: false, error: 'Missing audio' });
      return;
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model,
    )}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const payload = {
      contents: [
        {
          parts: [
            { text: `Transcribe this audio precisely into ${lang} text. Only provide the text output.` },
            { inline_data: { mime_type: mimeType, data: audio } },
          ],
        },
      ],
    };

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const text = await resp.text().catch(() => '');
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (_err) {
      data = null;
    }

    if (!resp.ok) {
      const msg = data?.error?.message ? String(data.error.message) : text || `HTTP ${resp.status}`;
      res.status(502).json({ success: false, error: `Gemini HTTP ${resp.status}: ${msg}` });
      return;
    }

    const out = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof out !== 'string' || !out.trim()) {
      res.status(502).json({ success: false, error: 'Gemini returned no text' });
      return;
    }

    res.status(200).json({ success: true, text: out.trim() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err?.message ?? 'Server error' });
  }
}
