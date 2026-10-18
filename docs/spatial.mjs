// Pure geometry and numeric functions shared by the viewer, editor and tests.
export function insideRoom(p,r){
  const eps=1e-7,t=p.y/r.depth;
  return p.z>=-eps&&p.z<=r.height+eps&&t>=-eps&&t<=1+eps&&p.x>=r.apexX*t-eps&&p.x<=r.width+(r.apexX-r.width)*t+eps;
}
export function makeIndex(rows){
  const index=new Map();
  for(const row of rows){const at=Date.parse(row.at);if(!Number.isFinite(at))continue;
    for(const[id,value]of Object.entries(row.values??{}))for(const metric of ['temperature','humidity']){
      if(!Number.isFinite(value?.[metric]))continue;
      const key=id+':'+metric;if(!index.has(key))index.set(key,[]);index.get(key).push({at,value:value[metric]});
    }
  }
  for(const list of index.values())list.sort((a,b)=>a.at-b.at);return index;
}
export function readingAt(index,id,metric,at,maxAgeMinutes){
  const list=index.get(id+':'+metric)??[];let lo=0,hi=list.length;
  while(lo<hi){const mid=(lo+hi)>>1;if(list[mid].at<=at)lo=mid+1;else hi=mid;}
  const p=list[lo-1];return p&&at-p.at<=maxAgeMinutes*60000?p:null;
}
export function frameSensors(index,sensors,settings,metric,at){
  return sensors.flatMap((s,i)=>{const p=settings.sensorPositions[s.id];if(!p)return[];
    const reading=readingAt(index,s.id,metric,at,settings.heatmap.maxAgeMinutes);
    return[{...s,...p,number:i+1,inside:insideRoom(p,settings.room),value:reading?.value??null,at:reading?.at??null}];
  });
}
export function interpolate(point,samples,power=2){
  const valid=samples.filter(s=>s.inside&&s.enabled&&Number.isFinite(s.value));if(!valid.length)return null;
  // Average co-located sensors, instead of depending on source order.
  const exact=valid.filter(s=>Math.hypot(s.x-point.x,s.y-point.y,s.z-point.z)<1e-7);
  if(exact.length)return exact.reduce((a,s)=>a+s.value,0)/exact.length;
  const distances=valid.map(s=>Math.hypot(s.x-point.x,s.y-point.y,s.z-point.z)),nearest=Math.min(...distances);
  let total=0,sum=0;
  valid.forEach((s,i)=>{const w=(nearest/distances[i])**power;total+=w;sum+=w*s.value;});return sum/total;
}
export function colorAt(value,min,max,colors){
  const t=Math.max(0,Math.min(1,(value-min)/(max-min))),m=colors.midpoint;
  const [a,b,f]=t<=m?[colors.low,colors.mid,t/m]:[colors.mid,colors.high,(t-m)/(1-m)];
  const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));const x=rgb(a),y=rgb(b);
  return '#'+x.map((v,i)=>Math.round(v+(y[i]-v)*f).toString(16).padStart(2,'0')).join('');
}
export function triangleMesh(room,z,n=18){
  const vertex=(i,j)=>({x:room.width*i/n+room.apexX*j/n,y:room.depth*j/n,z});const cells=[];
  for(let i=0;i<n;i++)for(let j=0;j<n-i;j++){
    cells.push([vertex(i,j),vertex(i+1,j),vertex(i,j+1)]);
    if(i+j<n-1)cells.push([vertex(i+1,j),vertex(i+1,j+1),vertex(i,j+1)]);
  }
  return cells;
}
export function wallMesh(room,n=14){
  const corners=[{x:0,y:0},{x:room.width,y:0},{x:room.apexX,y:room.depth}],cells=[];
  for(let k=0;k<3;k++){
    const a=corners[k],b=corners[(k+1)%3],p=(i,j)=>({x:a.x+(b.x-a.x)*i/n,y:a.y+(b.y-a.y)*i/n,z:room.height*j/n});
    for(let i=0;i<n;i++)for(let j=0;j<n;j++)cells.push([p(i,j),p(i+1,j),p(i,j+1)],[p(i+1,j),p(i+1,j+1),p(i,j+1)]);
  }
  return cells;
}
export function planBounds(room,positions=[]){
  let x0=-room.width*.25,x1=room.width*1.25,y0=-room.depth*.25,y1=room.depth*1.25,z0=-room.height*.1,z1=room.height*1.2;
  for(const p of positions){x0=Math.min(x0,p.x-room.width*.1);x1=Math.max(x1,p.x+room.width*.1);y0=Math.min(y0,p.y-room.depth*.1);y1=Math.max(y1,p.y+room.depth*.1);z0=Math.min(z0,p.z-room.height*.1);z1=Math.max(z1,p.z+room.height*.1);}
  return{x0,x1,y0,y1,z0,z1};
}

export function orthographicProjection(view,b){
  const range=view==='plan'?[b.y0,b.y1]:[b.z0,b.z1];
  const scale=Math.min(540/(b.x1-b.x0),255/Math.max(b.y1-b.y0,b.z1-b.z0));
  return{range,scale,left:50+(540-(b.x1-b.x0)*scale)/2,top:35+(255-(range[1]-range[0])*scale)/2};
}
