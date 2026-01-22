import { getCharacter } from '../server/characters.js';

let resolvedClaudeModelId = null;
const sessionStore = new Map();

function parseCookies(header) {
  if (!header) return {};
  return header.split(';').reduce((acc, part) => {
    const [key, ...rest] = part.trim().split('=');
    if (!key) return acc;
    acc[key] = decodeURIComponent(rest.join('='));
    return acc;
  }, {});
}

export function getSession(req, res) {
  const cookies = parseCookies(req.headers?.cookie ?? '');
  let sessionId = cookies.session_id;

  if (!sessionId) {
    sessionId = crypto.randomUUID();
    res.setHeader('Set-Cookie', `session_id=${sessionId}; Path=/; HttpOnly; SameSite=Lax`);
  }

  if (!sessionStore.has(sessionId)) {
    sessionStore.set(sessionId, { selected_character: null, conversation_history: [] });
  }

  return sessionStore.get(sessionId);
}

export function sanitizeCharacter(character) {
  return {
    id: character.id,
    name: character.name,
    gender: character.gender,
    speaker_id: character.speaker_id,
    age: character.age,
  };
}

async function getResolvedClaudeModelId(apiKey, apiUrl) {
  if (resolvedClaudeModelId) return resolvedClaudeModelId;

  const requested = String(process.env.CLAUDE_MODEL ?? '').trim();

  if (!requested) {
    resolvedClaudeModelId = 'claude-3-5-haiku-20241022';
    return resolvedClaudeModelId;
  }

  if (!/(sonnet\s*3\.?7|3\.?7\s*sonnet)/i.test(requested)) {
    resolvedClaudeModelId = requested;
    return resolvedClaudeModelId;
  }

  const modelsUrl = new URL(apiUrl);
  modelsUrl.pathname = '/v1/models';
  modelsUrl.search = '';

  const resp = await fetch(modelsUrl.toString(), {
    method: 'GET',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
  });

  if (!resp.ok) {
    const errorText = await resp.text().catch(() => '');
    throw new Error(`Claude models list HTTP ${resp.status}: ${errorText || 'Request failed'}`);
  }

  const json = await resp.json().catch(() => null);
  const models = Array.isArray(json?.data) ? json.data : [];

  const match = models.find((m) => {
    const id = String(m?.id ?? '');
    const dn = String(m?.display_name ?? '');
    return /(sonnet)/i.test(id + ' ' + dn) && /(3\.?7)/i.test(id + ' ' + dn);
  });

  resolvedClaudeModelId = String(match?.id ?? '').trim() || 'claude-3-5-haiku-20241022';
  return resolvedClaudeModelId;
}

export async function getClaudeResponse(character, userMessage, history) {
  const apiKey = process.env.CLAUDE_API_KEY;
  const apiUrl = process.env.CLAUDE_API_URL ?? 'https://api.anthropic.com/v1/messages';

  if (!apiKey) {
    throw new Error('Missing CLAUDE_API_KEY. Add it in .env.');
  }

  const model = await getResolvedClaudeModelId(apiKey, apiUrl);

  const messages = [];
  const historyCount = history.length;

  for (let i = 0; i < historyCount; i++) {
    messages.push({ role: history[i].role, content: history[i].content });
  }

  messages.push({ role: 'user', content: userMessage });

  const body = {
    model,
    max_tokens: 400,
    system: character.system_prompt,
    messages,
  };

  const resp = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errorText = await resp.text().catch(() => '');
    throw new Error(`Claude API HTTP ${resp.status}: ${errorText || 'Request failed'}`);
  }

  const json = await resp.json().catch(() => null);
  const text = json?.content?.[0]?.text;

  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('Claude API returned no text response');
  }

  return text;
}

export async function getInitialGreeting(character) {
  const apiKey = process.env.CLAUDE_API_KEY;
  const apiUrl = process.env.CLAUDE_API_URL ?? 'https://api.anthropic.com/v1/messages';

  if (!apiKey) return null;

  const model = await getResolvedClaudeModelId(apiKey, apiUrl);
  const greetingPrompt =
    character.system_prompt +
    "\n\nزۆر گرنگ: ئێستا کەسێک پەیوەندیت پێوە دەگرێت. تۆ دەبێت سەرەتا قسە بکەیت وەک کاتێک کەسێک تەلەفۆنت بۆ دێت. هەر جارێک بە شێوەیەکی جیاواز سڵاو بکە یان بپرسە کێیە. بۆ نموونە:\n- ئەلۆ؟\n- ئەلۆ کێیە؟\n- بەڵێ فەرموو؟\n- ئەلۆ تۆ کێیت؟\n- هەڵۆ؟\n- ئەلۆ فەرموو؟\n- بەڵێ؟\n\nتەنها یەک ڕستەی کورت بڵێ بە شێوەی سروشتی وەک کاتێک کەسێک تەلەفۆنت بۆ دێت.";

  const body = {
    model,
    max_tokens: 100,
    system: greetingPrompt,
    messages: [{ role: 'user', content: '[پەیوەندی تەلەفۆن دەگرێت]' }],
  };

  const resp = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errorText = await resp.text().catch(() => '');
    console.error(`Initial greeting failed HTTP ${resp.status}: ${errorText || 'Request failed'}`);
    return null;
  }

  const json = await resp.json().catch(() => null);
  const text = json?.content?.[0]?.text;
  return typeof text === 'string' ? text : null;
}

export async function convertTextToSpeech(text, speakerId) {
  const apiKey = process.env.KURDISH_TTS_API_KEY;
  const apiUrl = process.env.KURDISH_TTS_API_URL ?? 'https://www.kurdishtts.com/api/tts-proxy';

  if (!apiKey) return null;

  const resp = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({ text, speaker_id: speakerId }),
  });

  if (!resp.ok) {
    const errorText = await resp.text().catch(() => '');
    console.error(`Kurdish TTS failed HTTP ${resp.status}: ${errorText || 'Request failed'}`);
    return null;
  }

  const buf = Buffer.from(await resp.arrayBuffer());
  return buf.toString('base64');
}

export function getSelectedCharacter(characterId) {
  return getCharacter(characterId);
}

export async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (_err) {
    return {};
  }
}
