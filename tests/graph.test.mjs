import test from 'node:test';
import assert from 'node:assert/strict';
import {renderChart,createChartLink} from '../docs/graph.mjs';
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
function chart(metric,series,link=null){
  const chart=new Element(),tooltip=new Element(),empty=new Element();chart.id='chart-'+metric;
  renderChart({chart,tooltip,empty,series,start,end,metric,settings:normalizeSettings({plugOverlay:{powerMax:200}}),link});
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
test('outdoor series are thicker and painted above indoor lines on both climate charts',()=>{
  for(const metric of ['temperature','humidity']){
    const c=chart(metric,[{id:'out',name:'外気',outdoor:true,color:'#855ca7',points:[{at:start,value:23},{at:start+120000,value:24}]},{id:'in',name:'室内',color:'#168377',points:[{at:start,value:23},{at:start+120000,value:24}]}]);
    const paths=all(c.chart).filter(n=>n.tag==='path');
    assert.deepEqual(paths.map(n=>n.attrs['data-sensor']),['in','out']);
    assert.equal(paths[0].attrs['stroke-width'],'2');assert.equal(paths[1].attrs['stroke-width'],'4');
  }
});
test('temperature and humidity selections follow the same sensor and exact time in both directions; Escape clears both',()=>{
  const link=createChartLink(),series=(values)=>[{id:'one',name:'室内',color:'#168377',points:values.map((value,i)=>({at:i?end:start,value}))}];
  const t=chart('temperature',series([20,21]),link),h=chart('humidity',series([60,65]),link);
  const key=(c,key)=>c.chart.onkeydown({key,preventDefault(){}});
  key(t,'ArrowRight');
  assert.equal(h.tooltip.hidden,false);assert.equal(h.tooltip.children[1].textContent,'65 %');
  assert.equal(all(t.chart).find(n=>n.attrs.class==='chart-focus').attrs['data-at'],String(end));
  assert.equal(all(h.chart).find(n=>n.attrs.class==='chart-focus').attrs['data-at'],String(end));
  key(h,'ArrowLeft');assert.equal(t.tooltip.children[1].textContent,'20.0 °C');
  key(h,'Escape');assert.equal(t.tooltip.hidden,true);assert.equal(h.tooltip.hidden,true);
});
test('linked missing readings show a time marker without substituting a nearby sample or a made-up dot',()=>{
  const link=createChartLink();
  const t=chart('temperature',[{id:'one',name:'室内',color:'#168377',points:[{at:end,value:21}]}],link);
  const h=chart('humidity',[{id:'one',name:'室内',color:'#168377',points:[{at:end-1000,value:65}]}],link);
  t.chart.onkeydown({key:'ArrowRight',preventDefault(){}});
  assert.equal(h.tooltip.children[1].textContent,'この時刻の記録なし');
  const focus=all(h.chart).find(n=>n.attrs.class==='chart-focus');
  assert.equal(focus.attrs['data-at'],String(end));assert.equal(focus.children[1].attrs.visibility,'hidden');
});
