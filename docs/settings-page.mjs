import {DEFAULT_SETTINGS,normalizeSettings} from './settings-model.mjs?v=4';
import {readSharedSettings,readRepositorySettings,saveSharedSettings} from './settings-store.mjs?v=4';
import {PositionEditor} from './position-editor.mjs?v=4';
const $=id=>document.getElementById(id);
const positionEditor=new PositionEditor();
let sensors=[],expectedSha=null,loaded=false,dirty=false,saving=false,pending=null;
function message(value,error=false){$('settings-message').textContent=value;$('settings-message').classList.toggle('error',error);$('settings-message').hidden=!value;}
function fill(input){
  const settings=normalizeSettings(input);
  positionEditor.set(settings,sensors);
  fillHeatmap(settings.heatmap);
  for(const metric of ['temperature','humidity'])for(const side of ['min','max']){
    const value=settings.axes[metric][side],id=metric+'-'+side;
    $(id+'-auto').checked=value===null;$(id).disabled=value===null;
    if(value!==null)$(id).value=value;
  }
  for(const key of ['defaultPeriodHours','defaultMetric','refreshSeconds','gapMinutes','staleMinutes','lineWidth'])$(key).value=settings[key];
  for(const key of ['showCards','showSummary','showReadings','showPoints'])$(key).checked=settings[key];
  $('settings-sensors').replaceChildren();
  for(const s of sensors){const label=document.createElement('label');label.className='check';const input=document.createElement('input');input.type='checkbox';input.dataset.sensor=s.id;input.checked=settings.visibleSensorIds===null||settings.visibleSensorIds.includes(s.id);label.append(input,document.createTextNode(s.name));$('settings-sensors').append(label);}
  if(!sensors.length)$('settings-sensors').textContent='センサーがまだ登録されていません。';
}
function formSettings(){
  const input={schemaVersion:1,axes:{temperature:{},humidity:{}}};
  for(const metric of ['temperature','humidity'])for(const side of ['min','max']){
    const id=metric+'-'+side;
    if(!$(id+'-auto').checked&&$(id).value.trim()==='')throw new Error('手動で指定する最小値・最大値を入力してください。');
    input.axes[metric][side]=$(id+'-auto').checked?null:Number($(id).value);
  }
  for(const key of ['defaultPeriodHours','refreshSeconds','gapMinutes','staleMinutes','lineWidth'])input[key]=Number($(key).value);
  input.defaultMetric=$('defaultMetric').value;
  for(const key of ['showCards','showSummary','showReadings','showPoints'])input[key]=$(key).checked;
  const selected=[...document.querySelectorAll('[data-sensor]:checked')].map(e=>e.dataset.sensor);
  input.visibleSensorIds=selected.length===sensors.length?null:selected;
  Object.assign(input,positionEditor.read());
  input.heatmap=readHeatmap();
  return normalizeSettings(input);
}
function colorPreview(metric){
  const low=$('heat-'+metric+'-low').value,mid=$('heat-'+metric+'-mid').value,high=$('heat-'+metric+'-high').value,at=Number($('heat-'+metric+'-midpoint').value);
  $('heat-'+metric+'-preview').style.background=`linear-gradient(90deg,${low},${mid} ${at}%,${high})`;
}
function fillHeatmap(heatmap){
  for(const metric of ['temperature','humidity']){
    for(const side of ['min','max']){const id='heat-'+metric+'-'+side,v=heatmap.axes[metric][side];$(id+'-auto').checked=v===null;$(id).disabled=v===null;if(v!==null)$(id).value=v;}
    for(const key of ['low','mid','high'])$('heat-'+metric+'-'+key).value=heatmap.colors[metric][key];
    $('heat-'+metric+'-midpoint').value=Math.round(heatmap.colors[metric].midpoint*100);colorPreview(metric);
  }
  $('heat-power').value=heatmap.power;$('heat-maxAge').value=heatmap.maxAgeMinutes;$('heat-showLabels').checked=heatmap.showLabels;
}
function readHeatmap(){
  const h={axes:{},colors:{},power:Number($('heat-power').value),maxAgeMinutes:$('heat-maxAge').value.trim()===''?NaN:Number($('heat-maxAge').value),showLabels:$('heat-showLabels').checked};
  for(const metric of ['temperature','humidity']){
    h.axes[metric]={};for(const side of ['min','max']){const id='heat-'+metric+'-'+side;h.axes[metric][side]=$(id+'-auto').checked?null:$(id).value.trim()===''?NaN:Number($(id).value);}
    h.colors[metric]={};for(const key of ['low','mid','high'])h.colors[metric][key]=$('heat-'+metric+'-'+key).value;
    h.colors[metric].midpoint=Number($('heat-'+metric+'-midpoint').value)/100;
  }
  return h;
}
for(const metric of ['temperature','humidity']){
  for(const side of ['min','max']){const id='heat-'+metric+'-'+side;$(id+'-auto').addEventListener('change',()=>{$(id).disabled=$(id+'-auto').checked;});}
  for(const key of ['low','mid','high','midpoint'])$('heat-'+metric+'-'+key).addEventListener('input',()=>colorPreview(metric));
}
document.querySelectorAll('[data-reverse-colors]').forEach(b=>b.addEventListener('click',()=>{const metric=b.dataset.reverseColors,low=$('heat-'+metric+'-low'),high=$('heat-'+metric+'-high'),old=low.value;low.value=high.value;high.value=old;colorPreview(metric);low.dispatchEvent(new Event('input',{bubbles:true}));}));
async function load(){
  $('reload-settings').disabled=true;
  try{
    const [latest,published]=await Promise.all([fetch('./data/latest.json?t='+Date.now(),{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('センサーを読み込めませんでした。');return r.json();}),readSharedSettings()]);
    sensors=latest.sensors;
    let canonical;try{canonical=await readRepositorySettings();}catch{}
    expectedSha=canonical?.sha??null;fill(canonical?.settings??published);loaded=true;dirty=false;$('save-settings').disabled=false;
    message(canonical?'現在の共有設定を読み込みました。変更は保存するまで他の閲覧者には反映されません。':'共有設定を読み込みました。保存時にGitHub上の最新設定を確認します。');
  }catch(error){message(error.message,true);}finally{$('reload-settings').disabled=false;}
}
for(const metric of ['temperature','humidity'])for(const side of ['min','max'])$(metric+'-'+side+'-auto').addEventListener('change',()=>{$(metric+'-'+side).disabled=$(metric+'-'+side+'-auto').checked;});
$('settings-form').addEventListener('input',()=>{if(loaded){dirty=true;message('未保存の変更があります。プレビューで確認してから共有保存できます。');}});
$('reset-settings').addEventListener('click',()=>{fill(DEFAULT_SETTINGS);dirty=true;message('標準設定をフォームに反映しました。共有設定は保存するまで変わりません。');});
$('reload-settings').addEventListener('click',()=>{if(dirty&&!confirm('未保存の変更を破棄し、共有設定を読み込み直しますか？'))return;load();});
$('preview-settings').addEventListener('click',()=>{try{const settings=formSettings();window.open('./?preview='+encodeURIComponent(JSON.stringify(settings)),'_blank','noopener,noreferrer');}catch(error){message(error.message,true);}});
$('settings-form').addEventListener('submit',event=>{event.preventDefault();try{pending=formSettings();$('admin-error').hidden=true;$('admin-dialog').showModal();$('admin-token').focus();}catch(error){message(error.message,true);}});
function close(){if(saving)return;$('admin-token').value='';pending=null;$('admin-dialog').close();}
$('close-admin').addEventListener('click',close);
$('admin-dialog').addEventListener('cancel',event=>{if(saving)event.preventDefault();else{$('admin-token').value='';pending=null;}});
$('admin-form').addEventListener('submit',async event=>{
  event.preventDefault();if(saving||!pending)return;saving=true;$('confirm-save').disabled=true;$('close-admin').disabled=true;$('admin-error').hidden=true;
  let token=$('admin-token').value.trim();$('admin-token').value='';
  try{
    if(!expectedSha){const current=await readRepositorySettings(token);expectedSha=current.sha;}
    const result=await saveSharedSettings(pending,token,expectedSha);expectedSha=result.sha;dirty=false;fill(result.settings);pending=null;$('admin-dialog').close();
    message('共有設定を保存しました。通常は次の収集・公開で、すべての閲覧者に反映されます。');
  }catch(error){$('admin-error').textContent=error.message;$('admin-error').hidden=false;}
  finally{token='';saving=false;$('confirm-save').disabled=false;$('close-admin').disabled=false;}
});
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
load();
