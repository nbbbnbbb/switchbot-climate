import {COLORS, pointsFor, stats, segments, csvCell} from './chart.mjs';
const $=id=>document.getElementById(id);
const date=new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
const clock=new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit'});
let sensors=[],rows=[],status={},days=1,metric='temperature',demo=false,busy=false,loadedAt=Date.now();
const hidden=new Set();
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const svg=(tag,attrs,text)=>{const n=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;return n;};
async function json(path){const r=await fetch(path+'?t='+Date.now(),{cache:'no-store'});if(!r.ok)throw new Error('Load failed');return r.json();}
function notify(text){$('notice').textContent=text;$('notice').hidden=!text;}
async function load(){
  if(busy||demo)return;busy=true;$('refresh').disabled=true;
  try{
    const [latest,state,manifest]=await Promise.all([json('./data/latest.json'),json('./data/status.json'),json('./data/manifest.json')]);
    const cutoff=new Date(Date.now()-days*86400000).toISOString().slice(0,7);
    const months=manifest.months.filter(m=>/^\d{4}-\d{2}$/.test(m)&&m>=cutoff);
    const results=await Promise.allSettled(months.map(m=>json('./data/history/'+m+'.json')));
    sensors=latest.sensors;status=state;rows=results.filter(r=>r.status==='fulfilled').flatMap(r=>r.value);loadedAt=Date.now();
    const partial=results.some(r=>r.status==='rejected');
    notify(partial?'一部の履歴を読み込めませんでした。しばらくしてから更新してください。':state.message||'');
    render();
  }catch{notify('データを読み込めませんでした。通信状態を確認し、更新してください。');$('connection-label').textContent='読込エラー';$('status-dot').className='dot error';}
  finally{busy=false;$('refresh').disabled=false;}
}
function render(){
  const times=sensors.map(s=>Date.parse(s.collectedAt)).filter(Number.isFinite), last=times.length?Math.max(...times):null;
  const stale=!last||Date.now()-last>20*60000;
  const healthy=status.state==='ok'&&!stale;
  $('status-dot').className='dot '+(demo||healthy?'ok':sensors.length?'error':'');
  $('connection-label').textContent=demo?'サンプル表示':healthy?'記録中':sensors.length?'取得状況を確認':'未接続';
  $('last-update').textContent=last?'最終取得 '+date.format(last):'実データはまだありません';
  $('setup').hidden=Boolean(sensors.length)&&!demo;
  $('demo-toggle').textContent=demo?'サンプル表示を終了する →':'サンプルデータで表示を試す →';
  if(!demo&&last&&stale&&!$('notice').textContent)notify('最後の取得から20分以上経過しています。表示されている値は現在値ではない可能性があります。');
  $('sensor-cards').replaceChildren();
  sensors.forEach((s,i)=>{
    const card=el('article',undefined,'sensor-card');card.style.setProperty('--sensor',COLORS[i%COLORS.length]);
    const title=el('h2',undefined,'sensor-name');title.append(el('i'),document.createTextNode(s.name));card.append(title);
    const values=el('div',undefined,'card-values');
    for(const [key,label,unit]of [['temperature','温度','°C'],['humidity','湿度','%']]){const box=el('div');box.append(el('small',label));const number=el('div',finite(s[key])?s[key].toFixed(key==='temperature'?1:0):'—','value');number.append(el('span',unit));box.append(number);values.append(box);}card.append(values);
    const isStale=s.state!=='ok'||!s.collectedAt||Date.now()-Date.parse(s.collectedAt)>20*60000;
    card.append(el('p',(demo?'サンプル · ':isStale?'最終取得値 · ':'取得 ')+(s.collectedAt?date.format(Date.parse(s.collectedAt)):'未取得'),'card-time'+(isStale?' stale':'')));
    $('sensor-cards').append(card);
  });
  $('legend').replaceChildren();sensors.forEach((s,i)=>{const label=el('label');label.style.setProperty('--sensor',COLORS[i%COLORS.length]);const input=el('input');input.type='checkbox';input.checked=!hidden.has(s.id);input.addEventListener('change',()=>{input.checked?hidden.delete(s.id):hidden.add(s.id);draw();});label.append(input,document.createTextNode(s.name));$('legend').append(label);});draw();
}
function selectedRows(){return rows.filter(r=>Date.parse(r.at)>=loadedAt-days*86400000);}
function draw(){
  const chart=$('chart');chart.replaceChildren(svg('title',{},(demo?'サンプル：':'')+(metric==='temperature'?'温度':'湿度')+'の推移。下の表とCSVでも確認できます。'));
  const start=loadedAt-days*86400000,end=loadedAt,unit=metric==='temperature'?'°C':'%';
  $('range-label').textContent=date.format(start)+' – '+date.format(end);
  const series=sensors.map((s,i)=>({...s,color:COLORS[i%COLORS.length],points:pointsFor(rows,s.id,metric,start)})).filter(s=>!hidden.has(s.id));
  let min=Infinity,max=-Infinity;for(const s of series)for(const p of s.points){min=Math.min(min,p.value);max=Math.max(max,p.value);}
  const has=Number.isFinite(min);$('chart-empty').hidden=has;
  if(!has){min=metric==='temperature'?15:30;max=metric==='temperature'?30:80;}
  const pad=Math.max((max-min)*.15,metric==='temperature'?1:3);min=Math.floor(min-pad);max=Math.ceil(max+pad);if(metric==='humidity'){min=Math.max(0,min);max=Math.min(100,max);}
  if(min===max)max=min+1;
  const x=t=>55+(t-start)/(end-start)*920,y=v=>280-(v-min)/(max-min)*250;
  for(let i=0;i<=5;i++){const v=min+(max-min)*i/5,Y=y(v);chart.append(svg('line',{x1:55,x2:975,y1:Y,y2:Y,class:'grid'}),svg('text',{x:42,y:Y+4,'text-anchor':'end'},v.toFixed(1)));}
  chart.append(svg('text',{x:16,y:16},unit));
  for(let i=0;i<=4;i++){const t=start+(end-start)*i/4;chart.append(svg('text',{x:x(t),y:310,'text-anchor':i===0?'start':i===4?'end':'middle'},days===1?clock.format(t):date.format(t)));}
  for(const s of series)for(const group of segments(s.points)){
    chart.append(svg('path',{d:group.map((p,i)=>(i?'L':'M')+x(p.at).toFixed(2)+','+y(p.value).toFixed(2)).join(' '),class:'series',stroke:s.color}));
    if(group.length===1)chart.append(svg('circle',{cx:x(group[0].at),cy:y(group[0].value),r:3,fill:s.color}));
  }
  const hit=svg('rect',{x:55,y:20,width:920,height:270,class:'hit'});chart.append(hit);
  hit.addEventListener('pointermove',event=>{const bounds=chart.getBoundingClientRect();const at=start+Math.max(0,Math.min(1,((event.clientX-bounds.left)/bounds.width*1000-55)/920))*(end-start);const lines=[];for(const s of series){let nearest=null;for(const p of s.points)if(!nearest||Math.abs(p.at-at)<Math.abs(nearest.at-at))nearest=p;if(nearest&&Math.abs(nearest.at-at)<Math.max(20*60000,(end-start)/100))lines.push(s.name+'  '+nearest.value.toFixed(1)+unit+' · '+date.format(nearest.at));}$('tooltip').textContent=lines.join('\n');$('tooltip').hidden=!lines.length;});
  hit.addEventListener('pointerleave',()=>{$('tooltip').hidden=true;});
  $('summary').replaceChildren();for(const s of series){const row=el('tr'),summary=stats(s.points);row.append(el('td',s.name));for(const key of ['min','average','max'])row.append(el('td',summary?summary[key].toFixed(1)+' '+unit:'—'));row.append(el('td',String(s.points.length)));$('summary').append(row);}if(!series.length){const row=el('tr');const cell=el('td',sensors.length?'表示するセンサーを選択してください':'記録待ち');cell.colSpan=5;row.append(cell);$('summary').append(row);}
  const visible=new Set(series.map(s=>s.id));const names=new Map(sensors.map(s=>[s.id,s.name]));let count=0;$('readings').replaceChildren();for(const row of [...selectedRows()].sort((a,b)=>Date.parse(b.at)-Date.parse(a.at))){for(const [id,v]of Object.entries(row.values)){if(!visible.has(id)||count>=100)continue;const tr=el('tr');tr.append(el('td',date.format(Date.parse(row.at))),el('td',names.get(id)||id),el('td',v.temperature),el('td',v.humidity));$('readings').append(tr);count++;}if(count>=100)break;}
  $('csv').disabled=!has;
}
function sample(){
  demo=!demo;hidden.clear();
  if(!demo){sensors=[];rows=[];status={state:'unconfigured'};notify('');render();load();return;}
  loadedAt=Date.now();rows=[];sensors=[{id:'sample-1',name:'サンプル A'},{id:'sample-2',name:'サンプル B'}];
  for(let i=0;i<=288;i++){const at=new Date(loadedAt-(288-i)*300000).toISOString(),values={};sensors.forEach((s,j)=>{values[s.id]={temperature:+(23+j*1.5+1.8*Math.sin(i/45+j)+.15*Math.cos(i/4)).toFixed(1),humidity:Math.round(52+j*5-6*Math.sin(i/45+j))};});rows.push({at,values});}
  sensors=sensors.map(s=>({...s,...rows.at(-1).values[s.id],collectedAt:rows.at(-1).at,state:'ok'}));status={state:'ok'};notify('サンプルデータを表示しています。実際の測定値ではありません。');render();
}
$('refresh').addEventListener('click',()=>demo?render():load());$('demo-toggle').addEventListener('click',sample);
document.querySelectorAll('[data-days]').forEach(button=>button.addEventListener('click',()=>{days=Number(button.dataset.days);document.querySelectorAll('[data-days]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));demo?draw():load();}));
document.querySelectorAll('[data-metric]').forEach(button=>button.addEventListener('click',()=>{metric=button.dataset.metric;document.querySelectorAll('[data-metric]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));draw();}));
$('csv').addEventListener('click',()=>{const names=new Map(sensors.map(s=>[s.id,s.name]));const records=[['取得日時（UTC）','センサー','温度（°C）','湿度（%）','データ種別']];for(const row of selectedRows())for(const [id,v]of Object.entries(row.values))if(!hidden.has(id))records.push([row.at,names.get(id)||id,v.temperature,v.humidity,demo?'サンプル':'API取得値']);const blob=new Blob(['\ufeff'+records.map(r=>r.map(csvCell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download=(demo?'sample-':'')+'climate-'+new Date().toISOString().slice(0,10)+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
load();setInterval(()=>{if(!document.hidden&&!demo)load();},60000);
