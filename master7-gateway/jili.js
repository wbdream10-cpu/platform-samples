'use strict';

const crypto = require('node:crypto');

// JILI API manual 1.1.2: fixed UTC-4; yyMMd (day is not zero-padded).
function jiliDate(now = new Date()) {
  const date = new Date(now.getTime() - 4 * 60 * 60 * 1000);
  return `${String(date.getUTCFullYear()).slice(-2)}${String(date.getUTCMonth() + 1).padStart(2, '0')}${date.getUTCDate()}`;
}

function md5(value) {
  return crypto.createHash('md5').update(value, 'utf8').digest('hex');
}

function jiliKey(query, agentId, agentKey, now = new Date()) {
  const keyG = md5(jiliDate(now) + agentId + agentKey);
  return crypto.randomBytes(3).toString('hex') + md5(query + keyG) + crypto.randomBytes(3).toString('hex');
}

function jiliCatalogueBody(agentId, agentKey, now) {
  // GetGameList has no specific fields; AgentId is the last signed parameter.
  if (!/^[A-Za-z0-9_]+$/.test(agentId)) throw new Error('jili_invalid_agent_id');
  const query = `AgentId=${agentId}`;
  return new URLSearchParams({ AgentId: agentId, Key: jiliKey(query, agentId, agentKey, now) }).toString();
}

module.exports = { jiliDate, jiliKey, jiliCatalogueBody };
