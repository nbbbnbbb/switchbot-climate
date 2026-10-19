import test from 'node:test';
import assert from 'node:assert/strict';
import {visibleClimateSensors,labelClimateSensors} from '../docs/devices.mjs';
import {plugLabel} from '../docs/plugs.mjs';
import {frontViewYaw} from '../docs/spatial.mjs';

test('both dashboard and settings exclude hub and retired CO2 without changing stored records',()=>{
  const sensors=[{id:'meter',name:'温湿度計 1',kind:'meter'},
    {id:'hub',name:'任意の名前',kind:'hub'},
    {id:'legacy',name:'ハブミニ ２２'},
    {id:'sensor-40754d56e91d',name:'改名したハブ'},
    {id:'co2',name:'CO₂センサー'},
    {id:'outdoor',name:'防水温湿度計 5'}];
  assert.deepEqual(visibleClimateSensors(sensors).map(s=>s.id),['meter','outdoor']);
  assert.equal(sensors.length,6);
});
test('plug purpose descriptions preserve app names, including normalized spaces and letters',()=>{
  assert.equal(plugLabel({name:'プラグミニ A'}),'プラグミニ A（除湿機）');
  assert.equal(plugLabel({name:'プラグミニ Ｂ'}),'プラグミニ Ｂ（加湿機）');
  assert.equal(plugLabel({name:'別の機器'}),'別の機器');
});
test('outdoor labels follow saved geometry, preserve names and update when a sensor moves indoors',()=>{
  const sensors=[{id:'outside',name:'温湿度計4'},{id:'inside',name:'室内'},{id:'unplaced',name:'防水温湿度計'}];
  const settings={room:{width:2,depth:1.73,height:2.4,apexX:1},sensorPositions:{outside:{x:.82,y:1.67,z:1.21},inside:{x:1,y:.5,z:1}}};
  const labelled=labelClimateSensors(sensors,settings);
  assert.equal(labelled[0].name,'温湿度計4（外気）');assert.equal(labelled[0].outdoor,true);
  assert.equal(labelled[1].name,'室内');assert.equal(labelled[2].outdoor,false);
  assert.equal(labelClimateSensors(labelled,settings)[0].name,'温湿度計4（外気）');
  settings.sensorPositions.outside={x:1,y:.5,z:1};
  assert.equal(labelClimateSensors(labelled,settings)[0].name,'温湿度計4');
  assert.equal(sensors[0].name,'温湿度計4');
});
test('front camera points toward C with C nearer than A and B for symmetric and asymmetric rooms',()=>{
  for(const apexX of [0,1,2]){
    const room={width:2,depth:1.73,apexX},yaw=frontViewYaw(room);
    const depth=(x,y)=>x*Math.sin(yaw)+y*Math.cos(yaw);
    assert.ok(depth(apexX,room.depth)<depth(0,0));
    assert.ok(depth(apexX,room.depth)<depth(room.width,0));
    const centroid={x:(room.width+apexX)/3,y:room.depth/3};
    const horizontal=(apexX-centroid.x)*Math.cos(yaw)-(room.depth-centroid.y)*Math.sin(yaw);
    assert.ok(Math.abs(horizontal)<1e-10);
  }
});
