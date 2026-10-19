import {axisDomain} from './settings-model.mjs?v=7';
import {insideRoom,makeIndex,frameSensors,interpolate,colorAt,triangleMesh,wallMesh,planBounds,frontViewYaw} from './spatial.mjs?v=9';
const fmt=new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'});
const $=id=>document.getElementById(id);
export class HeatmapViewer{
  constructor(){
    this.canvas=$('heatmap-canvas');this.ctx=this.canvas.getContext('2d');this.metric='temperature';this.follow=true;this.frames=[];this.yaw=Math.PI;this.elevation=.45;this.zoom=1;this.timer=null;this.data=null;this.cache=null;
    document.querySelectorAll('[data-heat-metric]').forEach(b=>b.addEventListener('click',()=>{this.metric=b.dataset.heatMetric;document.querySelectorAll('[data-heat-metric]').forEach(t=>t.setAttribute('aria-selected',String(t===b)));this.updateFrame();}));
    $('heat-time').addEventListener('input',()=>{this.stop();this.follow=false;this.at=this.frames[Number($('heat-time').value)];this.updateFrame();});
    $('heat-latest').addEventListener('click',()=>{this.stop();this.follow=true;this.at=this.frames.at(-1);this.updateFrame();});
    for(const [id,delta]of [['heat-prev',-1],['heat-next',1]])$(id).addEventListener('click',()=>{this.stop();this.follow=false;const i=this.frameIndex();this.at=this.frames[Math.max(0,Math.min(this.frames.length-1,i+delta))];this.updateFrame();});
    $('heat-play').addEventListener('click',()=>{if(this.timer)this.stop();else this.play();});
    $('heat-speed').addEventListener('change',()=>{if(this.timer){this.stop();this.play();}});
    $('heat-reset-view').addEventListener('click',()=>this.resetView());
    $('heat-zoom-in').addEventListener('click',()=>{this.zoom=Math.min(3,this.zoom*1.2);this.draw();});
    $('heat-zoom-out').addEventListener('click',()=>{this.zoom=Math.max(.45,this.zoom/1.2);this.draw();});
    let drag=null;
    this.canvas.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY};this.canvas.setPointerCapture(e.pointerId);});
    this.canvas.addEventListener('pointermove',e=>{if(!drag)return;this.yaw+=(e.clientX-drag.x)*.008;this.elevation=Math.max(.08,Math.min(1.4,this.elevation+(e.clientY-drag.y)*.006));drag={x:e.clientX,y:e.clientY};this.draw();});
    const end=()=>{drag=null;};this.canvas.addEventListener('pointerup',end);this.canvas.addEventListener('pointercancel',end);
    this.canvas.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home'].includes(e.key))return;e.preventDefault();if(e.key==='Home'){this.resetView();return;}else if(e.key==='ArrowLeft')this.yaw-=.12;else if(e.key==='ArrowRight')this.yaw+=.12;else this.elevation=Math.max(.08,Math.min(1.4,this.elevation+(e.key==='ArrowUp'?.1:-.1)));this.draw();});
    this.resize=new ResizeObserver(()=>this.draw());this.resize.observe(this.canvas);
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.stop();});
  }
  resetView(){this.yaw=this.data?frontViewYaw(this.data.settings.room):Math.PI;this.elevation=.45;this.zoom=1;this.draw();}
  frameIndex(){if(!this.frames.length)return 0;let lo=0,hi=this.frames.length;while(lo<hi){const m=(lo+hi)>>1;if(this.frames[m]<=this.at)lo=m+1;else hi=m;}return Math.max(0,lo-1);}
  update({sensors,rows,settings,start,end,demo=false}){
    if(!this.data)this.yaw=frontViewYaw(settings.room);
    const changed=this.data?.rows!==rows;this.data={sensors,rows,settings,start,end,demo};
    if(changed){this.index=makeIndex(rows);this.cache=null;}
    this.frames=[...new Set(rows.map(r=>Date.parse(r.at)).filter(at=>Number.isFinite(at)&&at>=start&&at<=end))].sort((a,b)=>a-b);
    if(this.follow||!this.frames.length)this.at=this.frames.at(-1);else{this.at=this.frames[this.frameIndex()];}
    $('heat-time').max=String(Math.max(0,this.frames.length-1));$('heat-time').disabled=!this.frames.length;
    for(const id of ['heat-play','heat-prev','heat-next','heat-latest'])$(id).disabled=!this.frames.length;
    this.cache=null;this.domains={};this.updateFrame();
  }
  stop(){clearTimeout(this.timer);this.timer=null;$('heat-play').textContent='▶ 再生';$('heat-play').setAttribute('aria-pressed','false');}
  play(){if(this.frames.length<2)return;this.follow=false;if(this.frameIndex()>=this.frames.length-1)this.at=this.frames[0];
    $('heat-play').textContent='❚❚ 停止';$('heat-play').setAttribute('aria-pressed','true');
    const tick=()=>{this.updateFrame();if(this.frameIndex()>=this.frames.length-1){this.stop();return;}this.timer=setTimeout(()=>{this.at=this.frames[this.frameIndex()+1];tick();},Number($('heat-speed').value));};tick();
  }
  updateFrame(){
    if(!this.data)return;const{settings,sensors,rows,start,end,demo}=this.data;
    this.samples=frameSensors(this.index,sensors,settings,this.metric,this.at??0);
    const count=this.samples.filter(s=>s.inside&&s.enabled&&Number.isFinite(s.value)).length;
    $('heat-visual').setAttribute('aria-labelledby','heat-'+this.metric+'-tab');
    const periodValues=[];
    if(!this.domains?.[this.metric])for(const s of sensors){const p=settings.sensorPositions[s.id];if(!p||!p.enabled||!insideRoom(p,settings.room))continue;
      for(const reading of this.index.get(s.id+':'+this.metric)??[])if(reading.at>=start&&reading.at<=end)periodValues.push(reading.value);
    }
    this.domains??={};this.domain=this.domains[this.metric]??=axisDomain(periodValues,this.metric,settings.heatmap.axes[this.metric]);
    $('heat-time').value=String(this.frameIndex());$('heat-time-label').textContent=this.at?fmt.format(this.at)+' JST':'記録待ち';
    $('heat-live-label').textContent=(demo?'サンプル / ':'')+(this.follow?'最新の記録':'履歴を表示');
    $('heat-start').textContent=this.frames.length?fmt.format(this.frames[0]):'—';$('heat-end').textContent=this.frames.length?fmt.format(this.frames.at(-1)):'—';
    $('heat-status').textContent=!this.samples.length?'センサーを配置すると、室内の分布を推定できます。':!count?'この時刻には、配置済みの室内センサーに有効な記録がありません。':count===1?'室内1台の値を一様表示しています。分布の推定には複数の測定点が必要です。':'室内'+count+'台から推定 ／ 室外センサーは補間から除外';
    $('heat-dimensions').textContent=(settings.room.dimensionsConfirmed?'設定寸法':'仮の寸法')+'：幅 '+settings.room.width+' × 奥行 '+settings.room.depth+' × 高さ '+settings.room.height+' m';
    const unit=this.metric==='temperature'?'°C':'%',colors=settings.heatmap.colors[this.metric];
    $('heat-colorbar').style.background=`linear-gradient(90deg,${colors.low},${colors.mid} ${colors.midpoint*100}%,${colors.high})`;
    $('heat-scale-min').textContent=this.domain.min.toFixed(1)+' '+unit;$('heat-scale-max').textContent=this.domain.max.toFixed(1)+' '+unit;
    $('heat-scale-note').textContent='自動範囲は選択期間で固定 ／ 色は範囲外で端の色に固定';
    $('heat-sensor-list').replaceChildren();
    for(const s of this.samples){const item=document.createElement('div');item.className='heat-reading';const name=document.createElement('span');name.textContent=s.name;
      const value=document.createElement('strong');value.textContent=Number.isFinite(s.value)?s.value.toFixed(1)+' '+unit:'欠測';
      const note=document.createElement('small');note.textContent=(s.inside?'室内':'外気')+(!s.enabled?'・補間対象外':'')+' / '+(s.at?fmt.format(s.at)+' 取得':'有効な記録なし');item.append(name,value,note);$('heat-sensor-list').append(item);
    }
    const missing=sensors.length-this.samples.length;$('heat-unplaced').textContent=missing?'未配置 '+missing+'台：設定画面の2面図で配置してください。':'';
    this.cache=null;this.draw();
  }
  draw(){
    if(!this.data||!this.ctx)return;const{settings}=this.data,r=settings.room,ctx=this.ctx,canvas=this.canvas;
    const width=canvas.clientWidth,height=canvas.clientHeight;if(!width||!height)return;
    const dpr=Math.min(devicePixelRatio||1,2);if(canvas.width!==Math.round(width*dpr)||canvas.height!==Math.round(height*dpr)){canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);}
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
    const corners=[{x:0,y:0,z:0},{x:r.width,y:0,z:0},{x:r.apexX,y:r.depth,z:0}],vertices=[...corners,...corners.map(p=>({...p,z:r.height}))];
    const raw=p=>{const x=p.x-r.width/2,y=p.y-r.depth/3,z=p.z-r.height/2,u=x*Math.cos(this.yaw)-y*Math.sin(this.yaw),d=x*Math.sin(this.yaw)+y*Math.cos(this.yaw);return{x:u,y:-d*Math.sin(this.elevation)-z*Math.cos(this.elevation),depth:d*Math.cos(this.elevation)-z*Math.sin(this.elevation)};};
    const all=[...vertices,...this.samples].map(raw),xs=all.map(p=>p.x),ys=all.map(p=>p.y),x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys),scale=Math.min((width-100)/Math.max(.1,x1-x0),(height-95)/Math.max(.1,y1-y0))*this.zoom;
    const project=p=>{const q=raw(p);return{x:width/2+(q.x-(x0+x1)/2)*scale,y:height/2+(q.y-(y0+y1)/2)*scale,depth:q.depth};};
    const path=points=>{ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();};
    if(!this.cache){
      const valid=this.samples.some(s=>s.inside&&s.enabled&&Number.isFinite(s.value));
      const cells=valid?[...wallMesh(r,12),...triangleMesh(r,r.height,16),...triangleMesh(r,0,16)].map(points=>({points,alpha:.66})):[];
      for(const cell of cells){const center=cell.points.reduce((a,p)=>({x:a.x+p.x/3,y:a.y+p.y/3,z:a.z+p.z/3}),{x:0,y:0,z:0});const value=interpolate(center,this.samples,settings.heatmap.power);cell.color=colorAt(value,this.domain.min,this.domain.max,settings.heatmap.colors[this.metric]);}
      this.cache={cells};
    }
    ctx.strokeStyle='#dbe5ee';ctx.lineWidth=1;
    const ground=planBounds(r);for(let i=0;i<=8;i++){const x=ground.x0+(ground.x1-ground.x0)*i/8,y=ground.y0+(ground.y1-ground.y0)*i/8;for(const pair of [[{x,y:ground.y0,z:0},{x,y:ground.y1,z:0}],[{x:ground.x0,y,z:0},{x:ground.x1,y,z:0}]]){const a=project(pair[0]),b=project(pair[1]);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}}
    // Painter's algorithm: 3D surface meshes are sorted by camera depth.
    const objects=this.cache.cells.map(c=>({...c,projected:c.points.map(project)}));
    objects.sort((a,b)=>b.projected.reduce((v,p)=>v+p.depth,0)-a.projected.reduce((v,p)=>v+p.depth,0));
    for(const o of objects){path(o.projected);ctx.globalAlpha=o.alpha;ctx.fillStyle=o.color;ctx.fill();ctx.strokeStyle=o.color;ctx.lineWidth=.5;ctx.stroke();}ctx.globalAlpha=1;
    ctx.strokeStyle='#45627d';ctx.lineWidth=1.6;
    for(const[a,b]of [[0,1],[1,2],[2,0],[3,4],[4,5],[5,3],[0,3],[1,4],[2,5]]){const p=project(vertices[a]),q=project(vertices[b]);ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.stroke();}
    const labels=[['A',vertices[0]],['B',vertices[1]],['C',vertices[2]]];ctx.font='11px system-ui';ctx.fillStyle='#667d90';for(const[label,p]of labels){const q=project(p);ctx.fillText(label,q.x+6,q.y+15);}
    const positioned=[...this.samples].map(s=>({...s,screen:project(s)})).sort((a,b)=>b.screen.depth-a.screen.depth),used=[];
    for(const s of positioned){const p=s.screen,value=Number.isFinite(s.value),color=value?colorAt(s.value,this.domain.min,this.domain.max,settings.heatmap.colors[this.metric]):'#9baab9';
      ctx.beginPath();ctx.arc(p.x,p.y,6,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();ctx.strokeStyle=s.inside?'#fff':'#354e6b';ctx.lineWidth=2;ctx.stroke();
      if(!settings.heatmap.showLabels)continue;
      const label=s.name+' · '+(value?s.value.toFixed(1)+(this.metric==='temperature'?' °C':' %'):'欠測');ctx.font='600 12px system-ui';const w=ctx.measureText(label).width+18;
      let x=Math.max(4,Math.min(width-w-4,p.x+12)),y=Math.max(4,Math.min(height-30,p.y-28));
      for(let tries=0;tries<8&&used.some(box=>x<box.x+box.w&&x+w>box.x&&y<box.y+26&&y+26>box.y);tries++)y=y+29<height-28?y+29:Math.max(4,y-58);
      used.push({x,y,w});ctx.strokeStyle='#91a4b5';ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(x+4,y+13);ctx.stroke();
      ctx.fillStyle='#ffffffed';ctx.fillRect(x,y,w,26);ctx.strokeStyle='#d3dfe9';ctx.strokeRect(x,y,w,26);ctx.fillStyle='#213d56';ctx.fillText(label,x+9,y+17);
    }
    canvas.setAttribute('aria-label','三角柱状恒温室の'+(this.metric==='temperature'?'温度':'湿度')+'推定分布。'+$('heat-status').textContent+'。矢印キーで回転。実測値は下の一覧に表示。');
  }
}
