'use strict';

const crypto = require('node:crypto');

function canonicalize(fields = {}) {
  return Object.entries(fields)
    .filter(([key, value]) => key !== 'sign' && value !== '' && value !== null && value !== undefined)
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join('&');
}

function md5Upper(value) {
  return crypto.createHash('md5').update(value, 'utf8').digest('hex').toUpperCase();
}

function formatVpayDateTime(timestampSeconds, timeZone = 'Asia/Kuala_Lumpur') {
  const date = new Date(Number(timestampSeconds) * 1000);
  if (!Number.isFinite(date.getTime())) throw new TypeError('invalid_timestamp');
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = type => parts.find(part => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

function signWithDateTime(fields, apiToken, dateTime) {
  const token = String(apiToken || '');
  if (!token) throw new TypeError('missing_api_token');
  const digest = md5Upper(canonicalize(fields));
  return Buffer.from(`token=${token}&dt=${dateTime}&ap=${digest}`, 'utf8').toString('base64');
}

function vpaySignature(fields, apiToken, timestampSeconds, timeZone) {
  return signWithDateTime(fields, apiToken, formatVpayDateTime(timestampSeconds, timeZone));
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function verifyVpayNotification(payload, apiToken) {
  if (!payload || typeof payload !== 'object') return false;
  const dateTime = String(payload.notify_time || '');
  const supplied = String(payload.sign || '');
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(dateTime) || !supplied) return false;
  return safeEqual(signWithDateTime(payload, apiToken, dateTime), supplied);
}

module.exports = {
  canonicalize,
  formatVpayDateTime,
  md5Upper,
  signWithDateTime,
  verifyVpayNotification,
  vpaySignature,
};
