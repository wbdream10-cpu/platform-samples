'use strict';

const crypto = require('node:crypto');

function text(value, name, maximum) {
  const result = typeof value === 'string' ? value : '';
  if (!result || result.length > maximum || /[\u0000-\u001f\u007f]/u.test(result)) {
    throw new TypeError(`invalid_${name}`);
  }
  return result;
}

function amount2(value) {
  const input = typeof value === 'number' && Number.isSafeInteger(value)
    ? String(value)
    : value;
  if (typeof input !== 'string' || !/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/.test(input)) {
    throw new TypeError('invalid_amount');
  }
  const [whole, fraction = ''] = input.split('.');
  if (whole === '0' && !/[1-9]/.test(fraction)) throw new TypeError('invalid_amount');
  return `${whole}.${fraction.padEnd(2, '0')}`;
}

function identifier(value, name) {
  let input;
  if (typeof value === 'string') input = value;
  else if (typeof value === 'bigint' && value >= 0n) input = value.toString();
  else if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) input = String(value);
  else throw new TypeError(`invalid_${name}`);
  return text(input, name, 128);
}

function secret(value) {
  return text(value, 'operator_secret_key', 1024);
}

function md5(value) {
  return crypto.createHash('md5').update(value, 'utf8').digest('hex');
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || '').toLowerCase());
  const b = Buffer.from(String(right || '').toLowerCase());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function paymentOrderSignature({ transactionId, playerUsername, amount }, operatorSecretKey) {
  const raw = text(transactionId, 'transaction_id', 128)
    + text(playerUsername, 'player_username', 100)
    + amount2(amount)
    + secret(operatorSecretKey);
  return md5(raw);
}

function paymentSignature({ paymentId, amount, transactionId }, operatorSecretKey) {
  const raw = identifier(paymentId, 'payment_id')
    + amount2(amount)
    + text(transactionId, 'transaction_id', 128)
    + secret(operatorSecretKey);
  return md5(raw);
}

function duitNowSignature({ dnpaymentId, amount, transactionId, status }, operatorSecretKey) {
  const normalizedStatus = typeof status === 'number' && Number.isSafeInteger(status)
    ? status
    : (typeof status === 'string' && /^(?:0|1|2|4)$/.test(status) ? Number(status) : NaN);
  if (![0, 1, 2, 4].includes(normalizedStatus)) {
    throw new TypeError('invalid_status');
  }
  const raw = identifier(dnpaymentId, 'dnpayment_id')
    + amount2(amount)
    + text(transactionId, 'transaction_id', 128)
    + String(normalizedStatus)
    + secret(operatorSecretKey);
  return md5(raw);
}

function verifyPaymentSignature(payload, operatorSecretKey) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)
      || !/^[a-f0-9]{32}$/i.test(String(payload.signature || ''))) return false;
  try {
    return safeEqual(paymentSignature({
      paymentId: payload.payment_id,
      amount: payload.amount,
      transactionId: payload.transaction_id,
    }, operatorSecretKey), payload.signature);
  } catch { return false; }
}

function verifyDuitNowSignature(payload, operatorSecretKey) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)
      || !/^[a-f0-9]{32}$/i.test(String(payload.signature || ''))) return false;
  try {
    return safeEqual(duitNowSignature({
      dnpaymentId: payload.dnpayment_id,
      amount: payload.amount,
      transactionId: payload.transaction_id,
      status: payload.status,
    }, operatorSecretKey), payload.signature);
  } catch { return false; }
}

module.exports = {
  amount2,
  duitNowSignature,
  paymentOrderSignature,
  paymentSignature,
  verifyDuitNowSignature,
  verifyPaymentSignature,
};
