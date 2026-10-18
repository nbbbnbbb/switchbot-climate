import {stateIntervals,powerDomain} from './plugs.mjs?v=7';
import {segments,pickPoint,timeTicks} from './chart.mjs?v=7';
import {axisDomain} from './settings-model.mjs?v=7';
const date=new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
const clock=new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit'});
const svg=(tag,attrs,text)=>{const n=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;return n;};
const text=(tag,value,cls)=>{const n=document.createElement(tag);n.textContent=value;if(cls)n.className=cls;return n;};
export function renderChart({chart,tooltip,empty,series,start,end,metric,settings,demo=false,plugs=[]}){
  tooltip.hidden=true;
  const unit=metric==='temperature'?'°C':'%',width=Math.max(280,chart.parentElement.clientWidth),height=330;
  chart.setAttribute('viewBox',`0 0 ${width} ${height}`);chart.setAttribute('preserveAspectRatio','none');
  chart.replaceChildren(svg('title',{},(demo?'サンプル：':'')+(metric==='temperature'?'温度':'湿度')+'の推移。線を指すと、そのセンサーの取得値だけを表示します。'));
  const values=[];for(const s of series)for(const p of s.points)values.push(p.value);
  const overlay=settings.plugOverlay,powerSeries=overlay.showPower?plugs.map(p=>({...p,plotKind:'power'})):[],stateSeries=overlay.showState?plugs:[];
  const has=values.length>0||plugs.some(p=>p.points.length);empty.hidden=has;
  const {min,max}=axisDomain(values,metric,settings.axes[metric]);
  const left=48,right=width-(powerSeries.length?48:18),top=25,bottom=stateSeries.length?260-stateSeries.length*17:280;
  const watts=powerDomain(powerSeries,overlay.powerMax),powerY=v=>bottom-v/watts.max*(bottom-top),laneY=i=>bottom+15+i*17;
  const x=t=>left+(t-start)/(end-start)*(right-left),y=v=>bottom-(v-min)/(max-min)*(bottom-top);
  const clipId=chart.id+'-clip';const defs=svg('defs',{}),clip=svg('clipPath',{id:clipId});clip.append(svg('rect',{x:left,y:top,width:right-left,height:bottom-top}));defs.append(clip);chart.append(defs);
  for(let i=0;i<=5;i++){const v=min+(max-min)*i/5,Y=y(v);chart.append(svg('line',{x1:left,x2:right,y1:Y,y2:Y,class:'grid'}),svg('text',{x:left-10,y:Y+4,'text-anchor':'end'},v.toFixed(1)));}
  chart.append(svg('text',{x:10,y:14},unit));
  if(powerSeries.length){chart.append(svg('text',{x:right+12,y:14,'data-power-axis':'true'},'W'));for(let i=0;i<=4;i++){const v=watts.max*i/4;chart.append(svg('text',{x:right+8,y:powerY(v)+4,class:'power-tick'},v.toFixed(watts.max<10?1:0)));}}
  const ticks=timeTicks(start,end,right-left),density=Math.min(1,(right-left)/Math.max(1,ticks.length*4));
  for(const tick of ticks){
    const X=x(tick.at);
    chart.append(svg('line',{x1:X,x2:X,y1:top,y2:bottom,class:'time-grid'+(tick.wholeHour?' whole-hour':' half-hour'),'data-at':new Date(tick.at).toISOString(),opacity:tick.wholeHour?density:density*.55}));
    if(tick.label){
      const edge=X-left<32?'start':right-X<32?'end':'middle';
      chart.append(svg('text',{x:X,y:308,'text-anchor':edge,class:'time-tick','data-at':new Date(tick.at).toISOString()},end-start<=86400000?clock.format(tick.at):date.format(tick.at)));
    }
  }
  const plots=svg('g',{'clip-path':`url(#${clipId})`});chart.append(plots);
  for(const s of series)for(const group of segments(s.points,settings.gapMinutes*60000)){
    plots.append(svg('path',{d:group.map((p,i)=>(i?'L':'M')+x(p.at).toFixed(2)+','+y(p.value).toFixed(2)).join(' '),class:'series',stroke:s.color,'stroke-width':settings.lineWidth,style:`stroke-width:${settings.lineWidth}`}));
    if(settings.showPoints||group.length===1)for(const p of group)plots.append(svg('circle',{cx:x(p.at),cy:y(p.value),r:settings.showPoints?2.5:3,fill:s.color}));
  }
  for(const s of powerSeries)for(const group of segments(s.points,Math.min(settings.gapMinutes,5)*60000)){
    plots.append(svg('path',{d:group.map((p,i)=>(i?'L':'M')+x(p.at).toFixed(2)+','+powerY(p.value).toFixed(2)).join(' '),class:'series plug-power',stroke:s.color,'stroke-width':2,'stroke-dasharray':'6 4'}));
    if(group.length===1||settings.showPoints)for(const p of group)plots.append(svg('circle',{cx:x(p.at),cy:powerY(p.value),r:3,fill:s.color,class:'plug-power-point'}));
  }
  const states=[];
  stateSeries.forEach((s,i)=>{
    const Y=laneY(i),intervals=stateIntervals(s.points,start,end);
    states.push({series:{...s,plotKind:'state',lane:i},intervals});
    chart.append(svg('text',{x:left-5,y:Y+4,'text-anchor':'end',class:'plug-lane-label'},String(i+1)));
    chart.append(svg('rect',{x:left,y:Y-6,width:right-left,height:12,fill:'#f3f5f8',rx:2}));
    for(const p of intervals){const w=x(p.end)-x(p.start);chart.append(svg('rect',{x:x(p.start),y:Y-6,width:w,height:12,fill:s.color,'fill-opacity':p.power==='on'?.65:.15,'data-plug':s.id,'data-power':p.power}));if(w>28)chart.append(svg('text',{x:x(p.start)+w/2,y:Y+3,'text-anchor':'middle',class:'plug-state-label',fill:p.power==='on'?'#fff':s.color},p.power.toUpperCase()));}
  });
  const plotY=(s,p)=>s.plotKind==='power'?powerY(p.value):s.plotKind==='state'?laneY(s.lane):y(p.value);
  const focus=svg('g',{'pointer-events':'none',visibility:'hidden'});
  const rule=svg('line',{y1:top,y2:bottom,stroke:'#9eabbc','stroke-dasharray':'3 4','stroke-width':1});
  const dot=svg('circle',{r:5,stroke:'#fff','stroke-width':2});focus.append(rule,dot);chart.append(focus);
  const hit=svg('rect',{x:left,y:top,width:right-left,height:(stateSeries.length?laneY(stateSeries.length-1)+8:bottom)-top,class:'hit'});chart.append(hit);
  let pinned=false,selected=null;
  function hide(){tooltip.hidden=true;focus.setAttribute('visibility','hidden');selected=null;}
  function show(match){
    selected=match;const {series:s,point:p}=match;
    tooltip.replaceChildren(text('div',s.name,'tooltip-name'),text('div',s.plotKind?(s.plotKind==='state'?p.power.toUpperCase()+' · '+p.value.toFixed(1)+' W':p.value.toFixed(1)+' W · '+p.power.toUpperCase()):p.value.toFixed(metric==='temperature'?1:0)+' '+unit,'tooltip-value'),text('div',date.format(p.at)+' 取得','tooltip-time'));
    tooltip.style.setProperty('--sensor',s.color);tooltip.hidden=false;
    const bounds=chart.getBoundingClientRect(),px=x(p.at)/width*bounds.width,py=plotY(s,p)/height*bounds.height;
    tooltip.style.left=Math.max(4,Math.min(bounds.width-tooltip.offsetWidth-4,px+16))+'px';
    tooltip.style.top=Math.max(4,Math.min(bounds.height-tooltip.offsetHeight-4,py-tooltip.offsetHeight-16))+'px';
    rule.setAttribute('x1',x(p.at));rule.setAttribute('x2',x(p.at));dot.setAttribute('cx',x(p.at));dot.setAttribute('cy',plotY(s,p));dot.setAttribute('fill',s.color);focus.setAttribute('visibility','visible');
  }
  function point(event){
    const bounds=chart.getBoundingClientRect(),sx=bounds.width/width,sy=bounds.height/height;
    const cursor={x:event.clientX-bounds.left,y:event.clientY-bounds.top};
    const targetAt=start+(cursor.x/sx-left)/(right-left)*(end-start);
    let nearest=pickPoint(series,targetAt,cursor,t=>x(t)*sx,v=>y(v)*sy,{maxDistance:16,maxGap:settings.gapMinutes*60000});
    const powerMatch=pickPoint(powerSeries,targetAt,cursor,t=>x(t)*sx,v=>powerY(v)*sy,{maxDistance:16,maxGap:Math.min(settings.gapMinutes,5)*60000});
    if(powerMatch&&(!nearest||powerMatch.distance<nearest.distance))nearest=powerMatch;
    for(const state of states){if(Math.abs(cursor.y-laneY(state.series.lane)*sy)>8*sy)continue;const interval=state.intervals.find(p=>targetAt>=p.start&&targetAt<=p.end);if(interval)nearest={series:state.series,point:state.series.points.find(p=>p.at===interval.at),distance:0};}
    if(nearest)show(nearest);else hide();
  }
  hit.addEventListener('pointermove',event=>{if(!pinned)point(event);});
  hit.addEventListener('pointerleave',()=>{if(!pinned)hide();});
  hit.addEventListener('click',event=>{pinned=false;point(event);pinned=event.pointerType==='touch'&&Boolean(selected);});
  chart.onkeydown=event=>{
    if(event.key==='Escape'){pinned=false;hide();return;}
    if(!['ArrowLeft','ArrowRight'].includes(event.key))return;
    const s=selected?.series||[...series,...powerSeries].find(s=>s.points.length);if(!s)return;event.preventDefault();
    let i=selected?s.points.indexOf(selected.point):s.points.length-1;
    if(selected)i=Math.max(0,Math.min(s.points.length-1,i+(event.key==='ArrowLeft'?-1:1)));
    pinned=true;show({series:s,point:s.points[i]});
  };
  return has;
}
