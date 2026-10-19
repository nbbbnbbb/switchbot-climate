import {stateIntervals,powerDomain} from './plugs.mjs?v=9';
import {segments,pickPoint,timeTicks} from './chart.mjs?v=7';
import {axisDomain} from './settings-model.mjs?v=7';
const date=new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
const clock=new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit'});
const svg=(tag,attrs,text)=>{const n=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;return n;};
const text=(tag,value,cls)=>{const n=document.createElement(tag);n.textContent=value;if(cls)n.className=cls;return n;};
export function renderChart({chart,tooltip,empty,series,start,end,metric,settings,demo=false}){
  tooltip.hidden=true;
  const isPower=metric==='power',unit=isPower?'W':metric==='temperature'?'°C':'%',width=Math.max(280,chart.parentElement.clientWidth),height=isPower?110:330;
  const label=isPower?'消費電力':metric==='temperature'?'温度':'湿度',gap=(isPower?Math.min(settings.gapMinutes,5):settings.gapMinutes)*60000;
  chart.setAttribute('viewBox',`0 0 ${width} ${height}`);chart.setAttribute('preserveAspectRatio','none');
  chart.replaceChildren(svg('title',{},(demo?'サンプル：':'')+label+'の推移。線を指すと、その機器の取得値だけを表示します。'));
  const values=[];for(const s of series)for(const p of s.points)values.push(p.value);
  const has=values.length>0;empty.hidden=has;
  const {min,max}=isPower?powerDomain(series,settings.plugOverlay.powerMax):axisDomain(values,metric,settings.axes[metric]);
  // Shared horizontal margins keep the humidity and power timestamps aligned.
  const left=48,right=width-18,top=isPower?14:25,bottom=isPower?85:280;
  const x=t=>left+(t-start)/(end-start)*(right-left),y=v=>bottom-(v-min)/(max-min)*(bottom-top);
  const clipId=chart.id+'-clip';const defs=svg('defs',{}),clip=svg('clipPath',{id:clipId});clip.append(svg('rect',{x:left,y:top,width:right-left,height:bottom-top}));defs.append(clip);chart.append(defs);
  const steps=isPower?2:5;
  for(let i=0;i<=steps;i++){const v=min+(max-min)*i/steps,Y=y(v);chart.append(svg('line',{x1:left,x2:right,y1:Y,y2:Y,class:'grid'}),svg('text',{x:left-10,y:Y+4,'text-anchor':'end'},v.toFixed(isPower&&max>=10?0:1)));}
  chart.append(svg('text',{x:10,y:isPower?10:14,'data-unit':unit},unit));
  const ticks=timeTicks(start,end,right-left),density=Math.min(1,(right-left)/Math.max(1,ticks.length*4));
  for(const tick of ticks){
    const X=x(tick.at);
    chart.append(svg('line',{x1:X,x2:X,y1:top,y2:bottom,class:'time-grid'+(tick.wholeHour?' whole-hour':' half-hour'),'data-at':new Date(tick.at).toISOString(),opacity:tick.wholeHour?density:density*.55}));
    if(tick.label){
      const edge=X-left<32?'start':right-X<32?'end':'middle';
      chart.append(svg('text',{x:X,y:isPower?104:308,'text-anchor':edge,class:'time-tick','data-at':new Date(tick.at).toISOString()},end-start<=86400000?clock.format(tick.at):date.format(tick.at)));
    }
  }
  const plots=svg('g',{'clip-path':`url(#${clipId})`});chart.append(plots);
  for(const s of series)for(const group of segments(s.points,gap)){
    plots.append(svg('path',{d:group.map((p,i)=>(i?'L':'M')+x(p.at).toFixed(2)+','+y(p.value).toFixed(2)).join(' '),class:'series'+(isPower?' plug-power':''),stroke:s.color,'stroke-width':settings.lineWidth,style:`stroke-width:${settings.lineWidth}`}));
    if(settings.showPoints||group.length===1)for(const p of group)plots.append(svg('circle',{cx:x(p.at),cy:y(p.value),r:settings.showPoints?2.5:3,fill:s.color}));
  }
  const focus=svg('g',{'pointer-events':'none',visibility:'hidden'});
  const rule=svg('line',{y1:top,y2:bottom,stroke:'#9eabbc','stroke-dasharray':'3 4','stroke-width':1});
  const dot=svg('circle',{r:5,stroke:'#fff','stroke-width':2});focus.append(rule,dot);chart.append(focus);
  const hit=svg('rect',{x:left,y:top,width:right-left,height:bottom-top,class:'hit'});chart.append(hit);
  let pinned=false,selected=null;
  function hide(){tooltip.hidden=true;focus.setAttribute('visibility','hidden');selected=null;}
  function show(match){
    selected=match;const {series:s,point:p}=match;
    tooltip.replaceChildren(text('div',s.name,'tooltip-name'),text('div',isPower?p.value.toFixed(1)+' W · '+p.power.toUpperCase():p.value.toFixed(metric==='temperature'?1:0)+' '+unit,'tooltip-value'),text('div',date.format(p.at)+' 取得','tooltip-time'));
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
    const nearest=pickPoint(series,targetAt,cursor,t=>x(t)*sx,v=>y(v)*sy,{maxDistance:16,maxGap:gap});
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

// ON/OFF lanes sit outside both plots, so they cannot obscure humidity or watts.
export function renderPlugStates({chart,tooltip,series,start,end}){
  tooltip.hidden=true;
  const width=Math.max(280,chart.parentElement.clientWidth),height=series.length*20+10,left=48,right=width-18;
  const x=t=>left+(t-start)/(end-start)*(right-left);
  chart.style.height=height+'px';chart.setAttribute('viewBox',`0 0 ${width} ${height}`);chart.setAttribute('preserveAspectRatio','none');
  chart.replaceChildren(svg('title',{},'プラグのON／OFF。番号は凡例に対応します。取得から最大5分まで表示します。'));
  let selected=null,pinned=false;
  const show=(s,p)=>{
    selected={s,p};tooltip.replaceChildren(text('div',s.name,'tooltip-name'),text('div',p.power.toUpperCase()+' · '+p.value.toFixed(1)+' W','tooltip-value'),text('div',date.format(p.at)+' 取得','tooltip-time'));
    tooltip.style.setProperty('--sensor',s.color);tooltip.hidden=false;
    const width=chart.getBoundingClientRect().width;
    tooltip.style.left=Math.max(4,Math.min(width-tooltip.offsetWidth-4,x(p.at)))+'px';tooltip.style.top='0px';
  };
  series.forEach((s,i)=>{
    const Y=8+i*20,intervals=stateIntervals(s.points,start,end);
    chart.append(svg('text',{x:left-8,y:Y+9,'text-anchor':'end',class:'plug-lane-label'},String(s.number??i+1)));
    chart.append(svg('rect',{x:left,y:Y,width:right-left,height:12,fill:'#f3f5f8',rx:2}));
    for(const p of intervals){
      const w=x(p.end)-x(p.start),rect=svg('rect',{x:x(p.start),y:Y,width:w,height:12,fill:s.color,'fill-opacity':p.power==='on'?.65:.15,'data-plug':s.id,'data-power':p.power});
      rect.append(svg('title',{},s.name+' '+p.power.toUpperCase()+' '+p.value.toFixed(1)+' W / '+date.format(p.at)+' 取得'));chart.append(rect);
      if(w>28)chart.append(svg('text',{x:x(p.start)+w/2,y:Y+9,'text-anchor':'middle',class:'plug-state-label','pointer-events':'none',fill:p.power==='on'?'#fff':s.color},p.power.toUpperCase()));
    }
    const hit=svg('rect',{x:left,y:Y,width:right-left,height:12,class:'hit'});chart.append(hit);
    const point=event=>{const bounds=chart.getBoundingClientRect(),at=start+((event.clientX-bounds.left)/bounds.width*width-left)/(right-left)*(end-start),p=intervals.find(p=>at>=p.start&&at<p.end);if(p)show(s,p);else{selected=null;tooltip.hidden=true;}};
    hit.addEventListener('pointermove',event=>{if(!pinned)point(event);});hit.addEventListener('pointerleave',()=>{if(!pinned)tooltip.hidden=true;});
    hit.addEventListener('click',event=>{pinned=false;point(event);pinned=event.pointerType==='touch'&&Boolean(selected);});
  });
  chart.onkeydown=event=>{
    if(event.key==='Escape'){pinned=false;tooltip.hidden=true;selected=null;return;}
    if(!['ArrowLeft','ArrowRight'].includes(event.key))return;
    const s=selected?.s??series.find(s=>s.points.length);if(!s)return;event.preventDefault();
    let i=selected?s.points.findIndex(p=>p.at===selected.p.at):s.points.length-1;
    if(selected)i=Math.max(0,Math.min(s.points.length-1,i+(event.key==='ArrowLeft'?-1:1)));pinned=true;show(s,s.points[i]);
  };
}
