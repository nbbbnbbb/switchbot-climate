import {segments,pickPoint} from './chart.mjs?v=2';
import {axisDomain} from './settings-model.mjs?v=2';
const date=new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
const clock=new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit'});
const svg=(tag,attrs,text)=>{const n=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;return n;};
const text=(tag,value,cls)=>{const n=document.createElement(tag);n.textContent=value;if(cls)n.className=cls;return n;};
export function renderChart({chart,tooltip,empty,series,start,end,metric,settings,demo=false}){
  tooltip.hidden=true;
  const unit=metric==='temperature'?'°C':'%',width=Math.max(280,chart.parentElement.clientWidth),height=330;
  chart.setAttribute('viewBox',`0 0 ${width} ${height}`);chart.setAttribute('preserveAspectRatio','none');
  chart.replaceChildren(svg('title',{},(demo?'サンプル：':'')+(metric==='temperature'?'温度':'湿度')+'の推移。線を指すと、そのセンサーの取得値だけを表示します。'));
  const values=[];for(const s of series)for(const p of s.points)values.push(p.value);
  const has=values.length>0;empty.hidden=has;
  const {min,max}=axisDomain(values,metric,settings.axes[metric]);
  const left=48,right=width-18,top=25,bottom=280;
  const x=t=>left+(t-start)/(end-start)*(right-left),y=v=>bottom-(v-min)/(max-min)*(bottom-top);
  const clipId=chart.id+'-clip';const defs=svg('defs',{}),clip=svg('clipPath',{id:clipId});clip.append(svg('rect',{x:left,y:top,width:right-left,height:bottom-top}));defs.append(clip);chart.append(defs);
  for(let i=0;i<=5;i++){const v=min+(max-min)*i/5,Y=y(v);chart.append(svg('line',{x1:left,x2:right,y1:Y,y2:Y,class:'grid'}),svg('text',{x:left-10,y:Y+4,'text-anchor':'end'},v.toFixed(1)));}
  chart.append(svg('text',{x:10,y:14},unit));
  const ticks=width<600?2:4;for(let i=0;i<=ticks;i++){const t=start+(end-start)*i/ticks;chart.append(svg('text',{x:x(t),y:308,'text-anchor':i===0?'start':i===ticks?'end':'middle'},end-start<=86400000?clock.format(t):date.format(t)));}
  const plots=svg('g',{'clip-path':`url(#${clipId})`});chart.append(plots);
  for(const s of series)for(const group of segments(s.points,settings.gapMinutes*60000)){
    plots.append(svg('path',{d:group.map((p,i)=>(i?'L':'M')+x(p.at).toFixed(2)+','+y(p.value).toFixed(2)).join(' '),class:'series',stroke:s.color,'stroke-width':settings.lineWidth,style:`stroke-width:${settings.lineWidth}`}));
    if(settings.showPoints||group.length===1)for(const p of group)plots.append(svg('circle',{cx:x(p.at),cy:y(p.value),r:settings.showPoints?2.5:3,fill:s.color}));
  }
  const focus=svg('g',{'pointer-events':'none','clip-path':`url(#${clipId})`,visibility:'hidden'});
  const rule=svg('line',{y1:top,y2:bottom,stroke:'#9eabbc','stroke-dasharray':'3 4','stroke-width':1});
  const dot=svg('circle',{r:5,stroke:'#fff','stroke-width':2});focus.append(rule,dot);chart.append(focus);
  const hit=svg('rect',{x:left,y:top,width:right-left,height:bottom-top,class:'hit'});chart.append(hit);
  let pinned=false,selected=null;
  function hide(){tooltip.hidden=true;focus.setAttribute('visibility','hidden');selected=null;}
  function show(match){
    selected=match;const {series:s,point:p}=match;
    tooltip.replaceChildren(text('div',s.name,'tooltip-name'),text('div',p.value.toFixed(metric==='temperature'?1:0)+' '+unit,'tooltip-value'),text('div',date.format(p.at)+' 取得','tooltip-time'));
    tooltip.style.setProperty('--sensor',s.color);tooltip.hidden=false;
    const bounds=chart.getBoundingClientRect(),px=x(p.at)/width*bounds.width,py=y(p.value)/height*bounds.height;
    tooltip.style.left=Math.max(4,Math.min(bounds.width-tooltip.offsetWidth-4,px+16))+'px';
    tooltip.style.top=Math.max(4,Math.min(bounds.height-tooltip.offsetHeight-4,py-tooltip.offsetHeight-16))+'px';
    rule.setAttribute('x1',x(p.at));rule.setAttribute('x2',x(p.at));dot.setAttribute('cx',x(p.at));dot.setAttribute('cy',y(p.value));dot.setAttribute('fill',s.color);focus.setAttribute('visibility','visible');
  }
  function point(event){
    const bounds=chart.getBoundingClientRect(),sx=bounds.width/width,sy=bounds.height/height;
    const cursor={x:event.clientX-bounds.left,y:event.clientY-bounds.top};
    const targetAt=start+(cursor.x/sx-left)/(right-left)*(end-start);
    const nearest=pickPoint(series,targetAt,cursor,t=>x(t)*sx,v=>y(v)*sy,{maxDistance:16,maxGap:settings.gapMinutes*60000});
    if(nearest)show(nearest);else hide();
  }
  hit.addEventListener('pointermove',event=>{if(!pinned)point(event);});
  hit.addEventListener('pointerleave',()=>{if(!pinned)hide();});
  hit.addEventListener('click',event=>{pinned=false;point(event);pinned=event.pointerType==='touch'&&Boolean(selected);});
  chart.onkeydown=event=>{
    if(event.key==='Escape'){pinned=false;hide();return;}
    if(!['ArrowLeft','ArrowRight'].includes(event.key))return;
    const s=selected?.series||series.find(s=>s.points.length);if(!s)return;event.preventDefault();
    let i=selected?s.points.indexOf(selected.point):s.points.length-1;
    if(selected)i=Math.max(0,Math.min(s.points.length-1,i+(event.key==='ArrowLeft'?-1:1)));
    pinned=true;show({series:s,point:s.points[i]});
  };
  return has;
}
