import {COLORS, pointsFor, stats, csvCell, isStale} from './chart.mjs?v=3';
import {DEFAULT_SETTINGS,normalizeSettings} from './settings-model.mjs?v=3';
import {readSharedSettings} from './settings-store.mjs?v=3';
import {renderChart} from './graph.mjs?v=3';
const $=id=>document.getElementById(id);
const date=new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
const clock=new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit'});
let sensors=[],rows=[],status={},days=1,metric='temperature',demo=false,busy=false,loadedAt=Date.now();
const hidden=new Set();
let settings=normalizeSettings(DEFAULT_SETTINGS),settingsApplied=false,refreshTimer=null;
let previewSettings=null;
try{const raw=new URLSearchParams(location.search).get('preview');if(raw)previewSettings=normalizeSettings(JSON.parse(raw));}catch{}
function applySettings(next){
  const old=settings,initial=!settingsApplied;
  settings=next;settingsApplied=true;
  if(initial||old.defaultPeriodHours!==next.defaultPeriodHours)days=next.defaultPeriodHours/24;
  if(initial||old.defaultMetric!==next.defaultMetric)metric=next.defaultMetric;
  if(initial||JSON.stringify(old.visibleSensorIds)!==JSON.stringify(next.visibleSensorIds)){
    hidden.clear();if(next.visibleSensorIds)for(const sensor of sensors)if(!next.visibleSensorIds.includes(sensor.id))hidden.add(sensor.id);
  }
  if(initial||old.refreshSeconds!==next.refreshSeconds){clearInterval(refreshTimer);refreshTimer=setInterval(()=>{if(!document.hidden&&!demo)load();},next.refreshSeconds*1000);}
  document.querySelectorAll('[data-days]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.days)===days)));
  document.querySelectorAll('[data-metric]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.metric===metric)));
  $('sensor-cards').hidden=!settings.showCards;$('summary-section').hidden=!settings.showSummary;$('readings-section').hidden=!settings.showReadings;
  $('cadence-label').textContent='約2分ごとに収集・公開／画面は'+settings.refreshSeconds+'秒ごとに再読込';
  $('gap-label').textContent=settings.gapMinutes+'分を超える取得の空白は線をつなぎません。';
}
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const svg=(tag,attrs,text)=>{const n=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;return n;};
async function json(path){const r=await fetch(path+'?t='+Date.now(),{cache:'no-store'});if(!r.ok)throw new Error('Load failed');return r.json();}
function notify(text){$('notice').textContent=text;$('notice').hidden=!text;}
async function load(){
  if(busy||demo)return;busy=true;$('refresh').disabled=true;
  try{
    const [latest,state,manifest,shared]=await Promise.all([json('./data/latest.json'),json('./data/status.json'),json('./data/manifest.json'),readSharedSettings().catch(()=>null)]);
    sensors=latest.sensors;applySettings(previewSettings||shared||settings);
    const cutoff=new Date(Date.now()-days*86400000).toISOString().slice(0,7);
    const months=manifest.months.filter(m=>/^\d{4}-\d{2}$/.test(m)&&m>=cutoff);
    const results=await Promise.allSettled(months.map(m=>json('./data/history/'+m+'.json')));
    sensors=latest.sensors;status=state;rows=results.filter(r=>r.status==='fulfilled').flatMap(r=>r.value);loadedAt=Date.now();
    const partial=results.some(r=>r.status==='rejected');
    notify(previewSettings?'設定プレビュー：この表示はまだ共有保存されていません。':partial?'一部の履歴を読み込めませんでした。しばらくしてから更新してください。':!shared?'共有設定を読み込めませんでした。前回の設定で表示しています。':state.message||'');
    render();
  }catch{notify('データを読み込めませんでした。通信状態を確認し、更新してください。');$('connection-label').textContent='読込エラー';$('status-dot').className='dot error';}
  finally{busy=false;$('refresh').disabled=false;}
}
function render(){
  const times=sensors.map(s=>Date.parse(s.collectedAt)).filter(Number.isFinite), last=times.length?Math.max(...times):null;
  const stale=!last||Date.now()-last>settings.staleMinutes*60000;
  const healthy=status.state==='ok'&&!stale;
  $('status-dot').className='dot '+(demo||healthy?'ok':sensors.length?'error':'');
  $('connection-label').textContent=demo?'サンプル表示':healthy?'記録中':sensors.length?(stale?'更新遅延':'取得状況を確認'):'未接続';
  $('last-update').textContent=last?'最終取得 '+date.format(last)+'（'+Math.max(0,Math.floor((Date.now()-last)/60000))+'分前）':'実データはまだありません';
  $('setup').hidden=Boolean(sensors.length)&&!demo;
  $('demo-toggle').textContent=demo?'サンプル表示を終了する →':'サンプルデータで表示を試す →';
  if(!demo&&last&&stale&&!$('notice').textContent)notify('最後の取得から'+settings.staleMinutes+'分以上経過しています。収集が遅延または停止している可能性があります。表示値の取得日時を確認してください。');
  $('sensor-cards').replaceChildren();
  sensors.forEach((s,i)=>{
    const card=el('article',undefined,'sensor-card');card.style.setProperty('--sensor',COLORS[i%COLORS.length]);
    const title=el('h2',undefined,'sensor-name');title.append(el('i'),document.createTextNode(s.name));card.append(title);
    const values=el('div',undefined,'card-values');
    for(const [key,label,unit]of [['temperature','温度','°C'],['humidity','湿度','%']]){const box=el('div');box.append(el('small',label));const number=el('div',finite(s[key])?s[key].toFixed(key==='temperature'?1:0):'—','value');number.append(el('span',unit));box.append(number);values.append(box);}card.append(values);
    const outdated=s.state!=='ok'||isStale(s.collectedAt,Date.now(),settings.staleMinutes);
    card.append(el('p',(demo?'サンプル · ':outdated?'最終取得値 · ':'取得 ')+(s.collectedAt?date.format(Date.parse(s.collectedAt)):'未取得'),'card-time'+(outdated?' stale':'')));
    $('sensor-cards').append(card);
  });
  $('legend').replaceChildren();sensors.forEach((s,i)=>{const label=el('label');label.style.setProperty('--sensor',COLORS[i%COLORS.length]);const input=el('input');input.type='checkbox';input.checked=!hidden.has(s.id);input.addEventListener('change',()=>{input.checked?hidden.delete(s.id):hidden.add(s.id);draw();});label.append(input,document.createTextNode(s.name));$('legend').append(label);});draw();
}
function selectedRows(){return rows.filter(r=>Date.parse(r.at)>=loadedAt-days*86400000);}
function draw(){
  const start=loadedAt-days*86400000,end=loadedAt,unit=metric==='temperature'?'°C':'%';
  $('range-label').textContent=date.format(start)+' – '+date.format(end);
  const series=sensors.map((s,i)=>({...s,color:COLORS[i%COLORS.length],points:pointsFor(rows,s.id,metric,start)})).filter(s=>!hidden.has(s.id));
  const has=renderChart({chart:$('chart'),tooltip:$('tooltip'),empty:$('chart-empty'),series,start,end,metric,settings,demo});
  $('summary').replaceChildren();
  for(const s of series){const row=el('tr'),summary=stats(s.points);row.append(el('td',s.name));for(const key of ['min','average','max'])row.append(el('td',summary?summary[key].toFixed(1)+' '+unit:'—'));row.append(el('td',String(s.points.length)));$('summary').append(row);}
  if(!series.length){const row=el('tr'),cell=el('td',sensors.length?'表示するセンサーを選択してください':'記録待ち');cell.colSpan=5;row.append(cell);$('summary').append(row);}
  const visible=new Set(series.map(s=>s.id)),names=new Map(sensors.map(s=>[s.id,s.name]));let count=0;$('readings').replaceChildren();
  for(const row of [...selectedRows()].sort((a,b)=>Date.parse(b.at)-Date.parse(a.at))){for(const[id,v]of Object.entries(row.values)){if(!visible.has(id)||count>=100)continue;const tr=el('tr');tr.append(el('td',date.format(Date.parse(row.at))),el('td',names.get(id)||id),el('td',v.temperature),el('td',v.humidity));$('readings').append(tr);count++;}if(count>=100)break;}
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
load();
let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(draw,150);});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!demo)load();});
