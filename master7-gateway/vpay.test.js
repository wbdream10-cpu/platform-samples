'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  canonicalize,
  formatVpayDateTime,
  signWithDateTime,
  verifyVpayNotification,
  vpaySignature,
} = require('./vpay');

test('VPay fields use ASCII key order and omit empty values and sign', () => {
  assert.equal(
    canonicalize({ trader_id: '123456', sign: 'ignored', amount: '100', empty: '', action: 'TRADER_ORDER' }),
    'action=TRADER_ORDER&amount=100&trader_id=123456'
  );
});

test('VPay timestamp is formatted in Malaysia time', () => {
  assert.equal(formatVpayDateTime(1765512732), '2025-12-12 12:12:12');
});

test('VPay signature follows the published MD5, token, timestamp and Base64 rule', () => {
  const fields = {
    action: 'TRADER_ORDER',
    trader_id: '123456',
    out_trade_no: 'M70001',
    amount: '100',
  };
  assert.equal(
    vpaySignature(fields, 'test-token', 1765512732),
    'dG9rZW49dGVzdC10b2tlbiZkdD0yMDI1LTEyLTEyIDEyOjEyOjEyJmFwPUQxMUE3QTE0NkU1QTlFNkFDNkFGRURDNDgzMjVCQkRD'
  );
});

test('VPay notification signature rejects tampered amounts', () => {
  const payload = {
    trader_id: '123456',
    trade_no: 'VP100',
    out_trade_no: 'M70001',
    state: '3',
    amount: '100',
    title: 'Deposit',
    notify_time: '2025-12-12 12:12:12',
  };
  payload.sign = signWithDateTime(payload, 'test-token', payload.notify_time);
  assert.equal(verifyVpayNotification(payload, 'test-token'), true);
  assert.equal(verifyVpayNotification({ ...payload, amount: '101' }, 'test-token'), false);
});
