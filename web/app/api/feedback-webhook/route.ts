import { NextRequest, NextResponse } from 'next/server';

import {
  buildTelegramMessage,
  type TallyPayload,
  verifyTallySignature,
} from '../../../lib/feedback';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NOT_CONFIGURED_REASON = 'feedback channel not configured';

function isConfigured() {
  return Boolean(
    process.env.TALLY_SIGNING_SECRET &&
      process.env.TELEGRAM_BOT_TOKEN &&
      process.env.TELEGRAM_FEEDBACK_CHAT_ID,
  );
}

function getThreadId() {
  const topicId = process.env.TELEGRAM_FEEDBACK_TOPIC_ID;

  if (!topicId || topicId === '0') {
    return null;
  }

  const parsed = Number(topicId);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    configured: isConfigured(),
  });
}

export async function POST(request: NextRequest) {
  const secret = process.env.TALLY_SIGNING_SECRET;
  const rawBody = await request.text();
  const signature = request.headers.get('tally-signature') ?? '';

  if (!secret || !verifyTallySignature(secret, rawBody, signature)) {
    return NextResponse.json({ ok: false, reason: 'invalid signature' }, { status: 401 });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_FEEDBACK_CHAT_ID;

  if (!token || !chatId) {
    return NextResponse.json({ ok: false, reason: NOT_CONFIGURED_REASON }, { status: 503 });
  }

  let payload: TallyPayload;

  try {
    payload = JSON.parse(rawBody) as TallyPayload;
  } catch {
    return NextResponse.json({ ok: false, reason: 'invalid payload' }, { status: 400 });
  }

  const telegramPayload: Record<string, unknown> = {
    chat_id: chatId,
    text: buildTelegramMessage(payload),
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  };
  const threadId = getThreadId();

  if (threadId !== null) {
    telegramPayload.message_thread_id = threadId;
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(telegramPayload),
    });

    if (!response.ok) {
      const responseText = await response.text();
      console.error('feedback-webhook telegram send failed', {
        status: response.status,
        body: responseText,
      });
    }
  } catch (error) {
    console.error('feedback-webhook telegram request failed', error);
  }

  return NextResponse.json({ ok: true });
}
