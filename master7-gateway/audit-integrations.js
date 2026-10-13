'use strict';
const fs = require('node:fs');

function auditIntegrations(data, intake, checkedAt = new Date().toISOString()) {
  const findings = [];
  const records = Array.isArray(data.connections) ? data.connections : [];
  const key = value => String(value || '').trim().toLowerCase();
  const brands = new Set();
  const groups = { '已验证': 0, '受阻': 0, '未验证': 0 };
  for (const row of records) {
    if (!key(row.brand) || !row.evidence || !row.environment) findings.push({ severity:'high', code:'missing_provider_fields', brand:row.brand || null });
    if (brands.has(key(row.brand))) findings.push({ severity:'high', code:'duplicate_brand', brand:row.brand });
    brands.add(key(row.brand));
    if (!Object.prototype.hasOwnProperty.call(groups,row.group)) findings.push({ severity:'high', code:'unknown_status_group', brand:row.brand });
    else groups[row.group]++;
  }
  for (const row of intake) if (!brands.has(key(row.brand))) findings.push({ severity:'high', code:'provider_intake_missing_from_registry', brand:row.brand });
  const c = data.frontendCatalogue || {};
  const counts = [c.uniqueDisplayedGames, c.sponsoredFreeSection?.gameCount, c.regularSection?.gameCount,
    c.jiliGameCount, c.kissH5GameCount];
  if (!counts.every(n=>Number.isSafeInteger(n)&&n>=0)) findings.push({severity:'high',code:'catalogue_counts_missing_or_invalid'});
  else if (counts[0] !== counts[1]+counts[2] || counts[0] !== counts[3]+counts[4]
      || Object.values(c.regularSection?.byProvider || {}).reduce((a,b)=>a+b,0)!==counts[2]) {
    findings.push({severity:'high',code:'catalogue_counts_do_not_reconcile'});
  }
  const callbackKeys = new Set();
  for (const row of data.callbacks || []) {
    const composite = key(row.provider)+'|'+key(row.type);
    if (callbackKeys.has(composite)) findings.push({severity:'high',code:'duplicate_callback_role',provider:row.provider,type:row.type});
    callbackKeys.add(composite);
    try { if (new URL(row.url).protocol!=='https:') throw Error(); }
    catch { findings.push({severity:'high',code:'invalid_callback_url',provider:row.provider}); }
  }
  const evidenceTime=Date.parse(data.asOf);
  if (!Number.isFinite(evidenceTime) || evidenceTime>Date.parse(checkedAt)) findings.push({severity:'high',code:'invalid_evidence_timestamp'});
  const ageSeconds=Number.isFinite(evidenceTime)?Math.max(0,Math.floor((Date.parse(checkedAt)-evidenceTime)/1000)):null;
  findings.push({severity:'medium',code:'historical_evidence_not_live_recheck',evidenceAsOf:data.asOf,registryUpdatedAt:data.registryUpdatedAt||null});
  return {
    checkedAt, scope:'registry_consistency_only', grain:'one upstream brand; accounts and currency ratios are not additional brands',
    source:{registry:'integrations-status.json',intake:'provider-intake-20261013.json',evidenceAsOf:data.asOf,ageSeconds},
    providerRows:records.length,uniqueBrands:brands.size,
    recordedCatalogueStatuses:{historicallyVerified:groups['已验证'],blocked:groups['受阻'],unverified:groups['未验证']},
    catalogueSnapshot:{uniqueGames:c.uniqueDisplayedGames,sponsoredGames:c.sponsoredFreeSection?.gameCount,regularGames:c.regularSection?.gameCount,
      originallyPublishedSiteVersion:c.siteVersion,gameLaunchAvailable:c.gameLaunchAvailable,liveRefreshVerified:c.liveRefreshVerified},
    paymentQaRecorded:data.payment?.businessQaPassed===true,
    consistencyPassed:!findings.some(f=>f.severity==='high'||f.severity==='critical'),findings,
    limits:['Counts describe saved evidence, not a new provider connection test.','Catalogue availability does not establish playable games or production settlement.'],
  };
}

if(require.main===module){
  const data=JSON.parse(fs.readFileSync(require.resolve('./integrations-status.json'),'utf8'));
  const intake=JSON.parse(fs.readFileSync(require.resolve('./provider-intake-20261013.json'),'utf8'));
  const report=auditIntegrations(data,intake);
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
  if(!report.consistencyPassed)process.exitCode=1;
}
module.exports={auditIntegrations};
