import test from 'node:test';
import assert from 'node:assert/strict';
import {renderChart} from '../docs/graph.mjs';
import {normalizeSettings} from '../docs/settings-model.mjs';

// Minimal DOM surface lets the real SVG renderer and keyboard tooltip run in CI.
class Element {
  constructor(tag='svg'){this.tag=tag;this.attrs={};this.children=[];this.parentElement={clientWidth:520};this.style={setProperty(){}};this.offsetWidth=160;this.offsetHeight=65;}
  setAttribute(key,value){this.attrs[key]=String(value);}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=children;}
  addEventListener(){}
  getBoundingClientRect(){return{width:520,height:this.attrs.viewBox?.endsWith('110')?110:330,left:0,top:0};}
}
globalThis.document={createElementNS:(_,tag)=>new Element(tag),createElement:tag=>new Element(tag)};
const all=e=>[e,...e.children.flatMap(all)];
const start=Date.parse('2026-10-19T09:07:00+09:00'),end=start+3600000;
function chart(metric,series){
  const chart=new Element(),tooltip=new Element(),empty=new Element();chart.id='chart-'+metric;
  renderChart({chart,tooltip,empty,series,start,end,metric,settings:normalizeSettings({plugOverlay:{powerMax:200}})});
  return{chart,tooltip,empty};
}
test('humidity and watts render separately with identical time-grid coordinates and one-third height',()=>{
  const humidity=chart('humidity',[{name:'室内',color:'#168377',points:[{at:start,value:60},{at:end,value:65}]}]);
  const power=chart('power',[{name:'プラグミニ A（除湿機）',color:'#c06016',points:[{at:start,value:180,power:'on'},{at:end,value:0,power:'off'}]}]);
  const grid=c=>all(c).filter(n=>n.attrs.class?.startsWith('time-grid')).map(n=>[n.attrs['data-at'],n.attrs.x1]);
  assert.deepEqual(grid(humidity.chart),grid(power.chart));
  assert.equal(humidity.chart.attrs.viewBox,'0 0 520 330');assert.equal(power.chart.attrs.viewBox,'0 0 520 110');
  assert.ok(all(humidity.chart).some(n=>n.attrs['data-unit']==='%'));
  assert.ok(!all(humidity.chart).some(n=>n.attrs['data-unit']==='W'||n.attrs.class?.includes('plug-power')));
  assert.ok(all(power.chart).some(n=>n.attrs['data-unit']==='W'));
  assert.ok(all(power.chart).some(n=>n.tag==='text'&&n.textContent==='200'));
  power.chart.onkeydown({key:'ArrowRight',preventDefault(){}});
  assert.equal(power.tooltip.children[0].textContent,'プラグミニ A（除湿機）');
  assert.equal(power.tooltip.children[1].textContent,'0.0 W · OFF');
});
