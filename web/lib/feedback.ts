import { createHmac, timingSafeEqual } from 'node:crypto';

export interface TallyField {
  key?: string;
  label?: string;
  type?: string;
  value?: unknown;
}

export interface TallyPayload {
  eventType?: string;
  eventId?: string;
  createdAt?: string;
  data?: {
    responseId?: string;
    submissionId?: string;
    formId?: string;
    formName?: string;
    fields?: TallyField[];
  };
}

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (Array.isArray(value)) {
    return value.map((item) => stringifyValue(item)).filter(Boolean).join(', ');
  }

  if (typeof value === 'object') {
    if ('text' in (value as Record<string, unknown>) && typeof (value as { text?: unknown }).text === 'string') {
      return (value as { text: string }).text;
    }

    return JSON.stringify(value);
  }

  return String(value);
}

function pickField(fields: TallyField[] | undefined, matcher: (field: TallyField) => boolean) {
  return fields?.find((field) => matcher(field) && stringifyValue(field.value).trim().length > 0);
}

function normalizeLabel(field: TallyField): string {
  return `${field.label ?? ''} ${field.key ?? ''} ${field.type ?? ''}`.toLowerCase();
}

export function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function buildTelegramMessage(payload: TallyPayload): string {
  const fields = payload.data?.fields ?? [];
  const categoryField = pickField(fields, (field) => {
    const label = normalizeLabel(field);
    return label.includes('category') || label.includes('카테고리');
  });
  const contactField = pickField(fields, (field) => {
    const label = normalizeLabel(field);
    return (
      label.includes('contact') ||
      label.includes('연락처') ||
      label.includes('email') ||
      label.includes('phone')
    );
  });
  const bodyField =
    pickField(fields, (field) => {
      const label = normalizeLabel(field);
      return (
        label.includes('message') ||
        label.includes('feedback') ||
        label.includes('자유') ||
        label.includes('내용') ||
        label.includes('description')
      );
    }) ??
    fields.find((field) => stringifyValue(field.value).trim().length > 0 && field !== categoryField && field !== contactField);

  const lines = [
    '<b>새 피드백 도착</b>',
    payload.data?.formName ? `폼: ${escapeHtml(payload.data.formName)}` : null,
    categoryField ? `카테고리: ${escapeHtml(stringifyValue(categoryField.value))}` : null,
    bodyField ? `내용: ${escapeHtml(stringifyValue(bodyField.value))}` : null,
    contactField ? `연락처: ${escapeHtml(stringifyValue(contactField.value))}` : null,
    payload.data?.submissionId
      ? `submission_id: <code>${escapeHtml(payload.data.submissionId)}</code>`
      : null,
  ];

  return lines.filter(Boolean).join('\n');
}

export function verifyTallySignature(secret: string, body: string, header: string): boolean {
  if (!secret || !header) {
    return false;
  }

  const expected = createHmac('sha256', secret).update(body).digest();
  let received: Buffer;

  try {
    received = Buffer.from(header, 'base64');
  } catch {
    return false;
  }

  if (received.length === 0 || expected.length !== received.length) {
    return false;
  }

  return timingSafeEqual(expected, received);
}
