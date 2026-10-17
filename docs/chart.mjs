export const COLORS = ['#3269b2', '#168377', '#b7653d', '#855ca7', '#b28c24', '#b25070'];
export function isStale(at, now=Date.now()) {
  const timestamp=Date.parse(at);
  return !Number.isFinite(timestamp)||now-timestamp>5*60000;
}
export function pointsFor(rows, id, metric, since) {
  return rows.map(r => ({at: Date.parse(r.at), value: r.values?.[id]?.[metric]}))
    .filter(p => Number.isFinite(p.at) && p.at >= since && Number.isFinite(p.value)).sort((a,b)=>a.at-b.at);
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
