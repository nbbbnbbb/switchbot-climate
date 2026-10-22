import test from 'node:test';
import assert from 'node:assert/strict';
import {timeWindow,anchorAtPosition,rowsInWindow} from '../docs/time-window.mjs';
import {pointsFor,stats} from '../docs/chart.mjs';
const hour=3600000,latest=Date.parse('2026-10-22T12:00:37Z');
const rows=Array.from({length:73},(_,i)=>({at:new Date(latest-(72-i)*hour).toISOString(),values:{a:{temperature:i}}}));

test('panning preserves the selected width and reaches both ends of retained history',()=>{
  const live=timeWindow(rows,6*hour,latest);
  assert.equal(live.end,latest);assert.equal(live.following,true);
  const earliest=timeWindow(rows,6*hour,latest,anchorAtPosition(live,0));
  assert.equal(earliest.start,Date.parse(rows[0].at));assert.equal(earliest.end-earliest.start,6*hour);
  assert.equal(earliest.following,false);
  assert.equal(anchorAtPosition(live,live.maxPosition),null);
});
test('a past window stays fixed after refresh while live mode advances; changing period retains the endpoint',()=>{
  const anchor=latest-24*hour;
  assert.equal(timeWindow(rows,hour,latest+120000,anchor).end,anchor);
  assert.equal(timeWindow(rows,6*hour,latest+120000,anchor).end,anchor);
  assert.equal(timeWindow(rows,hour,latest+120000).end,latest+120000);
  const short=timeWindow(rows,7*24*hour,latest,anchor);
  assert.equal(short.disabled,true);assert.equal(short.end,latest);
  assert.equal(timeWindow([],hour,latest).disabled,true);
});
test('past summaries, exports and chart points exclude newer readings and include both boundaries',()=>{
  const start=latest-5*hour,end=latest-3*hour;
  const selected=rowsInWindow(rows,start,end),points=pointsFor(rows,'a','temperature',start,end);
  assert.deepEqual(points.map(p=>p.value),[67,68,69]);
  assert.deepEqual(selected.map(r=>Date.parse(r.at)),points.map(p=>p.at));
  assert.deepEqual(stats(points),{min:67,max:69,average:68});
});
