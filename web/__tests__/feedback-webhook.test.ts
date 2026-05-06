import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

import {
  buildTelegramMessage,
  verifyTallySignature,
  type TallyPayload,
} from '../lib/feedback.ts';

const samplePayload: TallyPayload = {
  eventType: 'FORM_RESPONSE',
  eventId: 'evt_123',
  createdAt: '2026-05-06T09:00:00.000Z',
  data: {
    responseId: 'resp_123',
    submissionId: 'sub_123',
    formId: 'form_123',
    formName: 'eodigakka feedback',
    fields: [
      { key: 'category', label: '카테고리', type: 'DROPDOWN', value: '버그' },
      {
        key: 'message',
        label: '자유 서술',
        type: 'LONG_TEXT',
        value: '지도에서 <script>alert(1)</script> 가 보입니다 & 재현됩니다.',
      },
      { key: 'contact', label: '연락처', type: 'EMAIL', value: 'user@example.com' },
    ],
  },
};

test('verifyTallySignature returns true for a valid signature', () => {
  const secret = 'top-secret';
  const body = JSON.stringify(samplePayload);
  const header = createHmac('sha256', secret).update(body).digest('base64');

  assert.equal(verifyTallySignature(secret, body, header), true);
});

test('verifyTallySignature returns false for an invalid signature', () => {
  const secret = 'top-secret';
  const body = JSON.stringify(samplePayload);

  assert.equal(verifyTallySignature(secret, body, 'bad-signature'), false);
});

test('buildTelegramMessage escapes HTML-sensitive characters', () => {
  const message = buildTelegramMessage(samplePayload);

  assert.match(message, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(message, /&amp; 재현됩니다\./);
});

test('buildTelegramMessage includes category, body, and contact in order', () => {
  const message = buildTelegramMessage(samplePayload);

  const categoryIndex = message.indexOf('카테고리');
  const bodyIndex = message.indexOf('내용');
  const contactIndex = message.indexOf('연락처');

  assert.notEqual(categoryIndex, -1);
  assert.notEqual(bodyIndex, -1);
  assert.notEqual(contactIndex, -1);
  assert.ok(categoryIndex < bodyIndex);
  assert.ok(bodyIndex < contactIndex);
  assert.match(message, /버그/);
  assert.match(message, /user@example\.com/);
});
