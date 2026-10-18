import test from 'node:test';
import assert from 'node:assert/strict';
import {plugPoints,stateIntervals,powerDomain} from '../docs/plugs.mjs';
import {normalizeSettings} from '../docs/settings-model.mjs';
test('plug zero watts and ON are independent; invalid values and absent samples are not fabricated',()=>{
 const rows=[{at:'2026-10-18T00:04Z',plugs:{a:{power:'off',powerWatts:0}}},{at:'2026-10-18T00:00Z',plugs:{a:{power:'on',powerWatts:0}}},{at:'2026-10-18T00:02Z',values:{}},{at:'2026-10-18T00:03Z',plugs:{a:{power:'on',powerWatts:null}}}];
 const p=plugPoints(rows,'a');assert.equal(p.length,2);assert.equal(p[0].power,'on');assert.equal(p[0].value,0);assert.equal(p[1].power,'off');assert.deepEqual(plugPoints(rows,'absent'),[]);
});
test('state bands expire, do not backfill before a first sample, and never bridge outages',()=>{
 const p=[{at:1000000,power:'on',value:120},{at:1120000,power:'off',value:0},{at:2800000,power:'on',value:50}];
 assert.deepEqual(stateIntervals(p,0,4000000).map(p=>[p.start,p.end,p.power]),[[1000000,1120000,'on'],[1120000,1420000,'off'],[2800000,3100000,'on']]);
 assert.deepEqual(stateIntervals(p,1200000,1300000).map(p=>[p.start,p.end]),[[1200000,1300000]]);
});
test('watts get their own zero-based domain, including all-OFF records and shared overrides',()=>{
 assert.deepEqual(powerDomain([{points:[{value:0}]}]),{min:0,max:10});assert.equal(powerDomain([{points:[{value:123}]}]).max,150);assert.equal(powerDomain([],200).max,200);
});
test('old settings enable plug overlays and share visibility and power range without leaking unknown fields',()=>{
 assert.deepEqual(normalizeSettings({}).plugOverlay,{showPower:true,showState:true,visiblePlugIds:null,powerMax:null});
 const s=normalizeSettings({plugOverlay:{showPower:false,visiblePlugIds:[],powerMax:200,token:'private'}});assert.deepEqual(s.plugOverlay,{showPower:false,showState:true,visiblePlugIds:[],powerMax:200});
 for(const plugOverlay of [{powerMax:0},{powerMax:NaN},{showState:'true'},{visiblePlugIds:['../bad']}])assert.throws(()=>normalizeSettings({plugOverlay}));
});
