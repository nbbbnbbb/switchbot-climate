import test from 'node:test';
import assert from 'node:assert/strict';
import {pointsFor, stats, segments, csvCell, isStale, pickPoint, timeTicks} from '../docs/chart.mjs';
test('pointing at one line only selects the nearby sensor',()=>{
  const series=[{id:'a',points:[{at:0,value:20},{at:100,value:20}]},{id:'b',points:[{at:0,value:50},{at:100,value:50}]}];
  const chosen=pickPoint(series,60,{x:60,y:49},x=>x,y=>y);
  assert.equal(chosen.series.id,'b');assert.equal(chosen.point.value,50);
  assert.equal(pickPoint(series,60,{x:60,y:100},x=>x,y=>y),null);
});
test('hover never invents a segment through missing collection data',()=>{
  const series=[{id:'a',points:[{at:0,value:20},{at:10000,value:30}]}];
  assert.equal(pickPoint(series,5000,{x:50,y:25},x=>x/100,y=>y,{maxGap:100,maxDistance:5}),null);
});
test('hover reports a real reading rather than an interpolated temperature',()=>{
  const series=[{id:'a',points:[{at:0,value:20},{at:100,value:30}]}];
  const chosen=pickPoint(series,75,{x:75,y:27.5},x=>x,y=>y);assert.equal(chosen.point.value,30);assert.equal(chosen.point.at,100);
});
test('stalled collection is marked stale after five minutes',()=>{
  const now=Date.parse('2026-10-17T02:00:00Z');
  assert.equal(isStale('2026-10-17T01:58:00Z',now),false);
  assert.equal(isStale('2026-10-17T01:54:00Z',now),true);
  assert.equal(isStale(undefined,now),true);
});
test('missing sensor readings never become zero or reuse old values',()=>{
  const rows=[{at:'2026-10-17T00:00:00Z',values:{a:{temperature:22}}},{at:'2026-10-17T00:05:00Z',values:{b:{temperature:25}}}];
  assert.deepEqual(pointsFor(rows,'a','temperature',0).map(p=>p.value),[22]);
  assert.equal(stats(pointsFor(rows,'missing','temperature',0)),null);
});
test('gaps over twenty minutes are disconnected',()=>{
  const points=[{at:0,value:2},{at:300000,value:3},{at:1800000,value:5}];
  assert.deepEqual(segments(points).map(s=>s.length),[2,1]);
});
test('statistics use actual acquired records',()=>{
  assert.deepEqual(stats([{value:10},{value:20},{value:30}]),{min:10,max:30,average:20});
});
test('CSV escapes quotes and spreadsheet formulas',()=>{
  assert.equal(csvCell('a"b'),'"a""b"');
  assert.equal(csvCell('=HYPERLINK("bad")'),'"\'=HYPERLINK(""bad"")"');
});

test('time grid uses real half hours instead of offsets from the current minute',()=>{
  const start=Date.parse('2026-10-18T09:07:13+09:00'),end=Date.parse('2026-10-18T10:07:13+09:00');
  const ticks=timeTicks(start,end,450);
  assert.deepEqual(ticks.map(t=>new Date(t.at).toISOString()),['2026-10-18T00:30:00.000Z','2026-10-18T01:00:00.000Z']);
  assert.deepEqual(ticks.map(t=>t.wholeHour),[false,true]);assert.ok(ticks.every(t=>t.label));
});
test('half-hour grid remains identical on both metrics and labels thin at whole hours for wider spans',()=>{
  const start=Date.parse('2026-10-18T09:07:00+09:00'),end=start+24*3600000;
  const narrow=timeTicks(start,end,300),wide=timeTicks(start,end,1000);
  assert.equal(narrow.length,48);assert.deepEqual(narrow.map(t=>t.at),wide.map(t=>t.at));
  assert.ok(narrow.filter(t=>t.label).length<wide.filter(t=>t.label).length);
  assert.ok(narrow.filter(t=>t.label).every(t=>t.wholeHour));
  assert.ok(narrow.every(t=>t.at>=start&&t.at<=end&&t.at%1800000===0));
});
test('long-span date labels align to Japan midnight and half-hour grids are preserved',()=>{
  const start=Date.parse('2026-10-18T09:07:00+09:00'),ticks=timeTicks(start,start+7*86400000,470);
  assert.equal(ticks.length,336);assert.ok(ticks.filter(t=>t.label).length>0);
  assert.ok(ticks.filter(t=>t.label).every(t=>t.midnight));
  assert.deepEqual(timeTicks(NaN,start),[]);assert.deepEqual(timeTicks(start,start),[]);
});
