import {
  convertTextToSpeech,
  getClaudeResponse,
  getSelectedCharacter,
  getSession,
  readJsonBody,
} from './_shared.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const userMessage = String(body?.message ?? '').trim();
    const session = getSession(req, res);
    const characterId = String(session.selected_character ?? body?.character ?? '').trim();
    if (characterId) {
      session.selected_character = characterId;
    }
    const character = getSelectedCharacter(characterId);

    if (!character) {
      res.status(400).json({ success: false, error: 'No character selected' });
      return;
    }

    if (!userMessage) {
      res.status(400).json({ success: false, error: 'Message is required' });
      return;
    }

    const history = Array.isArray(session.conversation_history)
      ? session.conversation_history
      : [];

    const responseText = await getClaudeResponse(character, userMessage, history);

    session.conversation_history = [
      ...history,
      { role: 'user', content: userMessage },
      { role: 'assistant', content: responseText },
    ];

    let audio = null;
    try {
      audio = await convertTextToSpeech(responseText, character.speaker_id);
    } catch (err) {
      console.error(err);
      audio = null;
    }

    const shouldEndCall = /\[END_CALL\]/.test(responseText);

    res.status(200).json({
      success: true,
      response: responseText.replace(/\s*\[END_CALL\]\s*/g, '').trim(),
      end_call: shouldEndCall,
      audio,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err?.message ?? 'Server error' });
  }
}
