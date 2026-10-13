'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {auditIntegrations}=require('./audit-integrations');
const source=require('./integrations-status.json');
const intake=require('./provider-intake-20261013.json');

test('saved registry has unique brands, covers intake and reconciles catalogue sections',()=>{
  const report=auditIntegrations(source,intake);
  assert.equal(report.consistencyPassed,true,JSON.stringify(report.findings));
  assert.equal(report.providerRows,report.uniqueBrands);
  assert.equal(report.paymentQaRecorded,false);
  assert.equal(report.catalogueSnapshot.gameLaunchAvailable,false);
  assert.equal(report.source.evidenceAsOf,source.asOf);
  assert.ok(report.findings.some(f=>f.code==='historical_evidence_not_live_recheck'));
});
test('registry audit catches duplicate brand, missing intake, callback role and inconsistent counts',()=>{
  const data=structuredClone(source);
  data.connections.push({...data.connections[0],brand:' '+data.connections[0].brand.toUpperCase()+' '});
  data.callbacks.push({...data.callbacks[0]});
  data.frontendCatalogue.sponsoredFreeSection.gameCount++;
  const report=auditIntegrations(data,[...intake,{brand:'missing fixture'}]);
  assert.equal(report.consistencyPassed,false);
  for(const code of ['duplicate_brand','duplicate_callback_role','catalogue_counts_do_not_reconcile','provider_intake_missing_from_registry'])assert.ok(report.findings.some(f=>f.code===code));
});
