export const COLORS = ['#3269b2', '#168377', '#b7653d', '#855ca7', '#b28c24', '#b25070'];
export function isStale(at, now=Date.now(), minutes=5) {
  const timestamp=Date.parse(at);
  return !Number.isFinite(timestamp)||now-timestamp>minutes*60000;
}
export function pickPoint(series,targetAt,cursor,projectX,projectY,{maxDistance=14,maxGap=20*60000}={}){
  let best=null;
  const accept=(s,p,distance)=>{if(distance<=maxDistance&&(!best||distance<=best.distance))best={series:s,point:p,distance};};
  for(const s of series){
    const points=s.points;let lo=0,hi=points.length;
    while(lo<hi){const mid=(lo+hi)>>1;if(points[mid].at<targetAt)lo=mid+1;else hi=mid;}
    for(let i=Math.max(0,lo-2);i<Math.min(points.length,lo+2);i++){
      const a=points[i],ax=projectX(a.at),ay=projectY(a.value);
      accept(s,a,Math.hypot(cursor.x-ax,cursor.y-ay));
      const b=points[i+1];if(!b||b.at-a.at>maxGap)continue;
      const bx=projectX(b.at),by=projectY(b.value),dx=bx-ax,dy=by-ay;
      const t=Math.max(0,Math.min(1,((cursor.x-ax)*dx+(cursor.y-ay)*dy)/(dx*dx+dy*dy||1)));
      accept(s,t<=.5?a:b,Math.hypot(cursor.x-ax-t*dx,cursor.y-ay-t*dy));
    }
  }
  return best;
}
export function pointsFor(rows, id, metric, since, until=Infinity) {
  return rows.map(r => ({at: Date.parse(r.at), value: r.values?.[id]?.[metric]}))
    .filter(p => Number.isFinite(p.at) && p.at >= since && p.at <= until && Number.isFinite(p.value)).sort((a,b)=>a.at-b.at);
}
export function stats(points) {
  if (!points.length) return null;
  const values = points.map(p=>p.value);
  return {min:Math.min(...values), max:Math.max(...values), average:values.reduce((a,b)=>a+b,0)/values.length};
}
export function segments(points, gap=20*60*1000) {
  const result=[];
  for (const p of points) {
    if (!result.length || p.at-result.at(-1).at(-1).at > gap) result.push([]);
    result.at(-1).push(p);
  }
  return result;
}
export function csvCell(value) {
  const text=String(value ?? '');
  return '"'+text.replace(/^[=+\-@\t\r]/,"'$&").replaceAll('"','""')+'"';
}

// Every grid line is anchored to a real :00 / :30 in Japan time.
// Labels thin out with the visible span; grid timestamps remain half-hourly.
export function timeTicks(start,end,pixels=600){
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return[];
  const halfHour=1800000,hour=3600000,offset=9*hour,span=end-start;
  const labelCount=Math.max(1,Math.floor(pixels/(span>86400000?105:65)));
  const minimum=span/labelCount;
  const labelStep=span<=2*hour&&minimum<=halfHour?halfHour:[1,2,3,6,12,24,48,72,168,336,720].map(h=>h*hour).find(step=>step>=minimum)??720*hour;
  const ticks=[];
  for(let at=Math.ceil(start/halfHour)*halfHour;at<=end;at+=halfHour)ticks.push({at,wholeHour:(at+offset)%hour===0,midnight:(at+offset)%86400000===0,label:(at+offset)%labelStep===0});
  return ticks;
}
// Synchronised cursors use an actual reading at the exact selected timestamp.
export function pointAtTime(points,at){
  let lo=0,hi=points.length;
  while(lo<hi){const mid=(lo+hi)>>1;if(points[mid].at<at)lo=mid+1;else hi=mid;}
  return points[lo]?.at===at?points[lo]:null;
}
