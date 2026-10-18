import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_SETTINGS,normalizeSettings} from '../docs/settings-model.mjs';
import {insideRoom,makeIndex,readingAt,frameSensors,interpolate,colorAt,triangleMesh,wallMesh,planBounds,orthographicProjection} from '../docs/spatial.mjs';
const room={width:4,depth:3,height:2.4,apexX:1};
test('triangular floor with vertical extrusion includes its boundaries, excludes box corners and outside height',()=>{
 for(const p of [{x:0,y:0,z:0},{x:4,y:0,z:2.4},{x:1,y:3,z:1},{x:1.5,y:1,z:1}])assert.equal(insideRoom(p,room),true);
 for(const p of [{x:4,y:3,z:1},{x:-.1,y:0,z:0},{x:1,y:1,z:2.5},{x:1,y:-.1,z:1}])assert.equal(insideRoom(p,room),false);
});
test('mesh tiles exactly the triangle and no point leaks outside the chamber',()=>{
 const mesh=triangleMesh(room,1.2,12);assert.equal(mesh.length,144);let area=0;
 for(const triangle of mesh){for(const p of triangle)assert.ok(insideRoom(p,room));const[a,b,c]=triangle;area+=Math.abs((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x))/2;}
 assert.ok(Math.abs(area-room.width*room.depth/2)<1e-8);for(const triangle of wallMesh(room,4))for(const p of triangle)assert.ok(insideRoom(p,room));
});
const t=Date.parse('2026-10-18T10:00:00Z');
const rows=[{at:new Date(t+120000).toISOString(),values:{'sensor-a':{temperature:24,humidity:60}}},{at:new Date(t).toISOString(),values:{'sensor-a':{temperature:20,humidity:50}}},{at:new Date(t+240000).toISOString(),values:{'sensor-a':{temperature:null,humidity:65}}}];
test('historical snapshots never use future data and expire absent readings per metric',()=>{
 const index=makeIndex(rows);assert.equal(readingAt(index,'sensor-a','temperature',t-1,5),null);
 assert.deepEqual(readingAt(index,'sensor-a','temperature',t+60000,5),{at:t,value:20});
 assert.equal(readingAt(index,'sensor-a','temperature',t+420001,5),null);
 assert.equal(readingAt(index,'sensor-a','humidity',t+420001,5).value,65);
 assert.equal(readingAt(index,'unknown','temperature',t,5),null);
});
test('only sensors with explicitly saved positions are shown, with outside values separate from the interior',()=>{
 const s=normalizeSettings({room,sensorPositions:{'sensor-a':{x:1,y:1,z:1},'sensor-b':{x:8,y:0,z:1}}});
 const snapshot=frameSensors(makeIndex(rows),[{id:'sensor-a'},{id:'sensor-b'},{id:'sensor-c'}],s,'temperature',t);
 assert.equal(snapshot.length,2);assert.equal(snapshot[0].value,20);assert.equal(snapshot[1].inside,false);assert.equal(snapshot[1].value,null);
});
test('spatial interpolation is exact at sensors, bounded, and ignores outdoors, disabled and missing sensors',()=>{
 const samples=[{x:0,y:0,z:0,value:10,inside:true,enabled:true},{x:2,y:0,z:0,value:30,inside:true,enabled:true},{x:1,y:0,z:0,value:1000,inside:false,enabled:true},{x:1,y:0,z:0,value:1000,inside:true,enabled:false},{x:1,y:0,z:0,value:null,inside:true,enabled:true}];
 assert.equal(interpolate({x:0,y:0,z:0},samples),10);assert.equal(interpolate({x:1,y:0,z:0},samples),20);
 for(let x=0;x<10;x+=.13){const v=interpolate({x,y:1,z:.5},samples,4);assert.ok(v>=10&&v<=30);}
 assert.equal(interpolate({x:0,y:0,z:0},[]),null);
 assert.equal(interpolate({x:0,y:0,z:0},[samples[0],{...samples[0],value:20}]),15);
});
test('custom color midpoint and end clipping preserve exact numeric-to-color correspondence',()=>{
 const colors={low:'#000000',mid:'#ff0000',high:'#ffffff',midpoint:.25};
 assert.equal(colorAt(-1,0,100,colors),'#000000');assert.equal(colorAt(25,0,100,colors),'#ff0000');assert.equal(colorAt(200,0,100,colors),'#ffffff');
 assert.equal(colorAt(12.5,0,100,colors),'#800000');
});
test('old shared settings migrate without inventing sensor positions or changing graph preferences',()=>{
 const settings=normalizeSettings({axes:{temperature:{min:15,max:30}},refreshSeconds:30});
 assert.deepEqual(settings.sensorPositions,{});assert.equal(settings.room.dimensionsConfirmed,false);assert.equal(settings.axes.temperature.min,15);assert.equal(settings.refreshSeconds,30);
 assert.deepEqual(normalizeSettings(settings),settings);assert.deepEqual(normalizeSettings(DEFAULT_SETTINGS),DEFAULT_SETTINGS);
});
test('invalid geometry, position coordinates and color settings cannot be shared',()=>{
 for(const config of [{room:{width:0}},{room:{apexX:3}},{sensorPositions:{'sensor-a':{x:NaN,y:0,z:1}}},{sensorPositions:{'sensor-a':{x:1,y:0,z:1,enabled:'yes'}}},{heatmap:{axes:{humidity:{min:50,max:40}}}},{heatmap:{colors:{temperature:{low:'red'}}}},{heatmap:{colors:{temperature:{midpoint:1}}}},{heatmap:{maxAgeMinutes:0}},{heatmap:{power:Infinity}}])assert.throws(()=>normalizeSettings(config));
 const settings=normalizeSettings({sensorPositions:{'sensor-a':{x:1,y:0,z:1,token:'secret'}},heatmap:{token:'secret'}});assert.equal(JSON.stringify(settings).includes('secret'),false);
});

test('orthographic plan and elevation share an equal unit scale and common horizontal coordinates',()=>{
 const b=planBounds(room,[{x:6,y:-1,z:1}]),plan=orthographicProjection('plan',b),front=orthographicProjection('front',b);
 assert.equal(plan.scale,front.scale);assert.equal(plan.left,front.left);
 for(const p of [plan,front]){assert.ok((b.x1-b.x0)*p.scale<=540);assert.ok((p.range[1]-p.range[0])*p.scale<=255);}
});
