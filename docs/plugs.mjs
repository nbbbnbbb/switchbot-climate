export const PLUG_COLORS=['#c06016','#6e4fb0'];
export function plugPoints(rows,id,start=-Infinity,end=Infinity){
  const byTime=new Map();
  for(const row of rows){const at=Date.parse(row.at),v=row.plugs?.[id];if(!v||!Number.isFinite(at)||at<start||at>end||!['on','off'].includes(v.power)||typeof v.powerWatts!=='number'||!Number.isFinite(v.powerWatts)||v.powerWatts<0)continue;byTime.set(at,{at,value:v.powerWatts,power:v.power});}
  return [...byTime.values()].sort((a,b)=>a.at-b.at);
}
// State is known only from its sample until the next sample or the freshness
// limit. Never fill a long outage or use a future sample to infer the past.
export function stateIntervals(points,start,end,maxAge=300000){
  return points.map((p,i)=>({start:Math.max(start,p.at),end:Math.min(end,points[i+1]?.at??end,p.at+maxAge),power:p.power,at:p.at,value:p.value})).filter(p=>p.end>p.start);
}
export function powerDomain(series,max=null){
  let high=0;for(const s of series)for(const p of s.points)high=Math.max(high,p.value);
  return {min:0,max:max??Math.max(10,Math.ceil(high*1.15/10)*10)};
}
