'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  amount2,
  duitNowSignature,
  paymentOrderSignature,
  paymentSignature,
  verifyDuitNowSignature,
  verifyPaymentSignature,
} = require('./gspay');

test('GSPAY MYR amounts have one canonical two-decimal representation', () => {
  assert.equal(amount2('10'), '10.00');
  assert.equal(amount2('10.0'), '10.00');
  assert.equal(amount2('10.00'), '10.00');
  assert.equal(amount2('0.01'), '0.01');
  for (const value of ['', '0', '0.00', '-1', '+1', '01', '1.001', '1e2', 10.5, {}, null]) {
    assert.throws(() => amount2(value), /invalid_amount/);
  }
});

test('GSPAY documented payment order signature vector matches exactly', () => {
  assert.equal(paymentOrderSignature({
    transactionId: 'transaction_id',
    playerUsername: 'player_username',
    amount: '10.00',
  }, 'operator_secret_key'), '0539187f3e6c875e6e5ec0bb6897e70c');
});

test('GSPAY documented payment callback and query signature vector matches exactly', () => {
  const payload = { paymentId: 'payment_id', amount: '10.00', transactionId: 'transaction_id_' };
  const signature = paymentSignature(payload, 'operator_secret_key');
  assert.equal(signature, '2d645fc5d5bbc784a57fe34eed72b8fa');
  assert.equal(verifyPaymentSignature({
    payment_id: payload.paymentId,
    amount: payload.amount,
    transaction_id: payload.transactionId,
    signature: signature.toUpperCase(),
  }, 'operator_secret_key'), true);
});

test('GSPAY documented DuitNow callback signature vector matches exactly', () => {
  const payload = { dnpaymentId: 'dnpayment_id', amount: '10.00', transactionId: 'transaction_id', status: 2 };
  const signature = duitNowSignature(payload, 'operator_secret_key');
  assert.equal(signature, '86c9cf2250d35f4e766becb636099236');
  assert.equal(verifyDuitNowSignature({
    dnpayment_id: payload.dnpaymentId,
    amount: payload.amount,
    transaction_id: payload.transactionId,
    status: payload.status,
    signature,
  }, 'operator_secret_key'), true);
});

test('GSPAY verifiers reject altered fields, invalid status and oversized identifiers', () => {
  const secret = 'operator_secret_key';
  const payment = { payment_id: '12345678901234567890', amount: '10.00', transaction_id: 'order_1' };
  payment.signature = paymentSignature({ paymentId: payment.payment_id, amount: payment.amount, transactionId: payment.transaction_id }, secret);
  assert.equal(verifyPaymentSignature({ ...payment, amount: '10.01' }, secret), false);
  assert.equal(verifyPaymentSignature({ ...payment, transaction_id: 'order_2' }, secret), false);
  assert.equal(verifyPaymentSignature({ ...payment, signature: 'x'.repeat(32) }, secret), false);
  assert.equal(verifyPaymentSignature({ ...payment, payment_id: '9'.repeat(129) }, secret), false);
  assert.throws(() => paymentSignature({ paymentId: 9007199254740992, amount: '1.00', transactionId: 'order' }, secret), /invalid_payment_id/);
  assert.equal(paymentSignature({ paymentId: 9007199254740993n, amount: '1.00', transactionId: 'order' }, secret),
    paymentSignature({ paymentId: '9007199254740993', amount: '1.00', transactionId: 'order' }, secret));
  for (const status of [-1, 3, 5, 1.5, 'unknown', true, null, '', '02']) {
    assert.throws(() => duitNowSignature({ dnpaymentId: '1', amount: '1.00', transactionId: 'order', status }, secret), /invalid_status/);
  }
});
