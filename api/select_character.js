import {
  convertTextToSpeech,
  getInitialGreeting,
  getSelectedCharacter,
  getSession,
  readJsonBody,
  sanitizeCharacter,
} from './_shared.js';

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }

  try {
    const body = req.method === 'POST' ? await readJsonBody(req) : {};
    const characterId = String(
      body?.character ?? req.query?.character ?? req.query?.id ?? '',
    );
    const character = getSelectedCharacter(characterId);

    if (!character) {
      res.status(400).json({ success: false, error: 'Invalid character' });
      return;
    }

    const session = getSession(req, res);
    session.selected_character = characterId;
    session.conversation_history = [];

    let initialMessage = null;
    try {
      initialMessage = await getInitialGreeting(character);
    } catch (err) {
      console.error(err);
      initialMessage = null;
    }

    if (initialMessage) {
      session.conversation_history.push({ role: 'assistant', content: initialMessage });
    }

    let initialAudio = null;
    if (initialMessage) {
      try {
        initialAudio = await convertTextToSpeech(initialMessage, character.speaker_id);
      } catch (err) {
        console.error(err);
        initialAudio = null;
      }
    }

    res.status(200).json({
      success: true,
      character: sanitizeCharacter(character),
      initial_message: initialMessage,
      initial_audio: initialAudio,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err?.message ?? 'Server error' });
  }
}
