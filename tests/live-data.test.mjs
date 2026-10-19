import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveReader,attemptedTime,mergeHistory} from '../docs/live-data.mjs';
const payload={schemaVersion:1,latest:{sensors:[]},status:{attemptedAt:'2026-10-19T16:30:00Z'},rows:[]};
test('direct read coalesces requests, obeys the public API rate limit, and retains cache on transient failure',async()=>{
 let now=0,calls=0,fail=false;
 const read=createLiveReader(async(url,opts)=>{calls++;assert.equal(opts.headers.Accept,'application/vnd.github.raw+json');if(fail)throw Error('offline');return{ok:true,json:async()=>payload};},()=>now);
 const [a,b]=await Promise.all([read(),read()]);assert.equal(a,payload);assert.equal(b,payload);assert.equal(calls,1);
 now=89999;await read();assert.equal(calls,1);
 now=90000;fail=true;assert.equal(await read(),payload);assert.equal(calls,3);
 now=90001;await read();assert.equal(calls,3);
});
test('live history overwrites only matching timestamps and preserves older history and real missing readings',()=>{
 const a={at:'2026-10-19T07:00:45Z',values:{a:{temperature:20}}},b={at:'2026-10-19T08:00:00Z',values:{}},fresh={...b,values:{a:{temperature:21}}};
 assert.deepEqual(mergeHistory([b,a],[fresh]),[a,fresh]);assert.equal(attemptedTime({}),0);
});
test('invalid direct responses are rejected rather than presenting fake fresh data',async()=>{
 const read=createLiveReader(async()=>({ok:true,json:async()=>({latest:{sensors:[]},rows:[]})}));assert.equal(await read(),null);
});
