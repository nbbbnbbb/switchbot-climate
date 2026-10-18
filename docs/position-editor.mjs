import {insideRoom,planBounds,orthographicProjection} from './spatial.mjs?v=5';
const $=id=>document.getElementById(id);
const svg=(tag,attrs={},label)=>{const e=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const[k,v]of Object.entries(attrs))e.setAttribute(k,v);if(label!==undefined)e.textContent=label;return e;};
export class PositionEditor{
  constructor(){
    this.positions={};this.sensors=[];this.room={width:2,depth:2,height:2.4,apexX:0,dimensionsConfirmed:false};this.drag=null;
    $('placement-sensor').addEventListener('change',()=>{this.selected=$('placement-sensor').value;this.fields();this.draw();});
    for(const key of ['width','depth','height','apexX'])$('room-'+key).addEventListener('input',()=>{const r=this.readRoom();if(['width','depth','height'].every(k=>r[k]>=.1&&r[k]<=100)&&r.apexX>=0&&r.apexX<=r.width){this.room=r;this.draw();}});
    for(const key of ['x','y','z'])$('position-'+key).addEventListener('input',()=>{if(!this.selected)return;const value=Number($('position-'+key).value);if(!Number.isFinite(value))return;this.ensure();this.positions[this.selected][key]=value;this.draw();});
    $('position-placed').addEventListener('change',()=>{if(!this.selected)return;if($('position-placed').checked)this.ensure();else delete this.positions[this.selected];this.fields();this.draw();});
    $('position-enabled').addEventListener('change',()=>{if(this.positions[this.selected])this.positions[this.selected].enabled=$('position-enabled').checked;this.draw();});
    for(const view of ['plan','front']){
      const chart=$('placement-'+view);
      chart.addEventListener('pointerdown',e=>{
        if(!this.selected)return;const id=e.target.closest('[data-position-id]')?.dataset.positionId;
        if(id){this.selected=id;$('placement-sensor').value=id;this.fields();}
        this.drag={view,bounds:planBounds(this.room,Object.values(this.positions))};chart.setPointerCapture(e.pointerId);this.move(e,view);
      });
      chart.addEventListener('pointermove',e=>{if(this.drag?.view===view)this.move(e,view);});
      const end=()=>{if(this.drag){this.drag=null;this.draw();}};chart.addEventListener('pointerup',end);chart.addEventListener('pointercancel',end);
      chart.addEventListener('keydown',e=>{
        if(!this.selected||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();this.ensure();const p=this.positions[this.selected],step=e.shiftKey?.1:.01;
        if(e.key==='ArrowLeft')p.x-=step;if(e.key==='ArrowRight')p.x+=step;
        const key=view==='plan'?'y':'z';if(e.key==='ArrowUp')p[key]+=step;if(e.key==='ArrowDown')p[key]-=step;
        for(const k of ['x','y','z'])p[k]=Math.max(-100,Math.min(200,Math.round(p[k]*100)/100));this.changed();this.fields();this.draw();
      });
    }
  }
  readRoom(){const r={};for(const key of ['width','depth','height','apexX']){const input=$('room-'+key);r[key]=input.value.trim()===''?NaN:Number(input.value);}r.dimensionsConfirmed=$('room-confirmed').checked;return r;}
  read(){const positions=structuredClone(this.positions);if(positions[this.selected])for(const k of ['x','y','z']){const v=$('position-'+k).value;positions[this.selected][k]=v.trim()===''?NaN:Number(v);}return{room:this.readRoom(),sensorPositions:positions};}
  set(settings,sensors){this.positions=structuredClone(settings.sensorPositions);this.room=structuredClone(settings.room);this.sensors=sensors;this.selected=sensors.some(s=>s.id===this.selected)?this.selected:sensors[0]?.id;
    for(const key of ['width','depth','height','apexX'])$('room-'+key).value=this.room[key];$('room-confirmed').checked=this.room.dimensionsConfirmed;
    $('placement-sensor').replaceChildren();for(const s of sensors){const option=document.createElement('option');option.value=s.id;option.textContent=s.name;$('placement-sensor').append(option);}$('placement-sensor').value=this.selected??'';this.fields();this.draw();
  }
  ensure(){if(!this.positions[this.selected])this.positions[this.selected]={x:Math.round((this.room.width+this.room.apexX)/3*100)/100,y:Math.round(this.room.depth/3*100)/100,z:this.room.height/2,enabled:true};}
  fields(){const p=this.positions[this.selected];$('position-placed').checked=Boolean(p);$('position-enabled').checked=p?.enabled??true;$('position-enabled').disabled=!p;
    for(const key of ['x','y','z']){$('position-'+key).disabled=!p;$('position-'+key).value=p?p[key]:'';}
  }
  changed(){$('placement-sensor').dispatchEvent(new Event('input',{bubbles:true}));}
  projection(view,b){return orthographicProjection(view,b);}
  move(event,view){
    const chart=$('placement-'+view),matrix=chart.getScreenCTM();if(!matrix)return;
    const pointer=chart.createSVGPoint();pointer.x=event.clientX;pointer.y=event.clientY;const cursor=pointer.matrixTransform(matrix.inverse()),b=this.drag.bounds,{range,scale,left,top}=this.projection(view,b);
    this.ensure();const p=this.positions[this.selected];p.x=Math.max(-100,Math.min(200,Math.round((b.x0+(cursor.x-left)/scale)*100)/100));p[view==='plan'?'y':'z']=Math.max(-100,Math.min(200,Math.round((range[1]-(cursor.y-top)/scale)*100)/100));this.fields();this.changed();this.draw();
  }
  draw(){
    const r=this.room,b=this.drag?.bounds??planBounds(r,Object.values(this.positions));
    for(const view of ['plan','front']){
      const chart=$('placement-'+view),{range,scale,left,top}=this.projection(view,b),x=v=>left+(v-b.x0)*scale,y=v=>top+(range[1]-v)*scale;
      chart.replaceChildren(svg('title',{},view==='plan'?'平面図。XとYを設定。':'正面図。Xと高さZを設定。'));
      chart.append(svg('rect',{x:0,y:0,width:620,height:340,fill:'#f6f9fc'}));
      for(let i=0;i<=4;i++){const xv=b.x0+(b.x1-b.x0)*i/4,yv=range[0]+(range[1]-range[0])*i/4;chart.append(svg('line',{x1:x(xv),x2:x(xv),y1:35,y2:290,stroke:'#e1e9f0'}),svg('text',{x:x(xv),y:313,'text-anchor':'middle',fill:'#778b9e','font-size':12},xv.toFixed(1)),svg('line',{x1:50,x2:590,y1:y(yv),y2:y(yv),stroke:'#e1e9f0'}),svg('text',{x:42,y:y(yv)+4,'text-anchor':'end',fill:'#778b9e','font-size':12},yv.toFixed(1)));}
      chart.append(svg('text',{x:590,y:333,'text-anchor':'end','font-size':12,fill:'#536b83'},'X (m)'),svg('text',{x:10,y:18,'font-size':12,fill:'#536b83'},view==='plan'?'Y / 奥行 (m)':'Z / 高さ (m)'));
      const coords=view==='plan'?[[0,0],[r.width,0],[r.apexX,r.depth]]:[[0,0],[r.width,0],[r.width,r.height],[0,r.height]];
      chart.append(svg('polygon',{points:coords.map(p=>x(p[0])+','+y(p[1])).join(' '),fill:'#dceaf480',stroke:'#7597b2','stroke-width':2}));
      if(view==='plan')for(const[label,a,c]of [['A',0,0],['B',r.width,0],['C',r.apexX,r.depth]])chart.append(svg('text',{x:x(a)+7,y:y(c)-8,fill:'#3d607e','font-size':13},label));
      else chart.append(svg('line',{x1:x(r.apexX),x2:x(r.apexX),y1:y(0),y2:y(r.height),stroke:'#7597b2','stroke-dasharray':'4 4'}));
      this.sensors.forEach((s,i)=>{const p=this.positions[s.id];if(!p)return;const selected=s.id===this.selected,cx=x(p.x),cy=y(p[view==='plan'?'y':'z']);const g=svg('g',{'data-position-id':s.id,role:'button',tabindex:0,'aria-label':s.name+'の位置',class:'placement-point'});
        g.append(svg('title',{},s.name),svg('circle',{cx,cy,r:selected?12:10,fill:selected?'#206eab':insideRoom(p,r)?'#788ea2':'#b87637',stroke:'white','stroke-width':2}),svg('text',{x:cx,y:cy+4,'text-anchor':'middle',fill:'white','font-size':11,'pointer-events':'none'},i+1));
        g.addEventListener('focus',()=>{if(this.selected!==s.id){this.selected=s.id;$('placement-sensor').value=s.id;this.fields();}});chart.append(g);
      });
    }
    $('placement-summary').replaceChildren();this.sensors.forEach((s,i)=>{const p=this.positions[s.id],button=document.createElement('button');button.type='button';button.className='placement-summary-item'+(s.id===this.selected?' selected':'');button.textContent=(i+1)+'. '+s.name+' / '+(p?(insideRoom(p,r)?'室内':'室外')+' ('+[p.x,p.y,p.z].map(v=>v.toFixed(2)).join(', ')+')':'未配置');button.addEventListener('click',()=>{this.selected=s.id;$('placement-sensor').value=s.id;this.fields();this.draw();});$('placement-summary').append(button);});
    $('position-location').textContent=this.positions[this.selected]?(insideRoom(this.positions[this.selected],r)?'室内：補間に使用できます。':'室外：点と実測値を表示し、室内の補間には使いません。'):'未配置：2面図をクリックするか「このセンサーを配置」をオンにしてください。';
  }
}
