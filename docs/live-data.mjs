const ENDPOINT='https://api.github.com/repos/nbbbnbbb/switchbot-climate/contents/docs/data/live.json';
const RAW='https://raw.githubusercontent.com/nbbbnbbb/switchbot-climate/main/docs/data/live.json';
export function attemptedTime(status){const n=Date.parse(status?.attemptedAt);return Number.isFinite(n)?n:0;}
export function mergeHistory(base,live){
  const map=new Map();for(const row of [...base,...live])if(row&&typeof row.at==='string'&&Number.isFinite(Date.parse(row.at)))map.set(row.at,row);
  return [...map.values()].sort((a,b)=>a.at.localeCompare(b.at));
}
export function createLiveReader(fetcher=fetch,now=()=>Date.now()){
  let cached=null,lastAttempt=-Infinity,inflight=null;
  return async function read(){
    if(inflight)return inflight;
    // A shared request supplies values and recent history. Limit unauthenticated
    // API traffic to 40/hour, and use the raw endpoint if the API is unavailable.
    if(now()-lastAttempt<90000)return cached;
    lastAttempt=now();
    inflight=(async()=>{
      for(const endpoint of [ENDPOINT,RAW]){
        const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
        try{
          const response=await fetcher(endpoint+'?ref=main&t='+now(),{headers:{Accept:'application/vnd.github.raw+json'},cache:'no-store',signal:controller.signal});
          if(!response.ok)throw new Error('Live data unavailable');
          const value=await response.json();
          if(value?.schemaVersion!==1||!Array.isArray(value.latest?.sensors)||!Array.isArray(value.rows)||!attemptedTime(value.status))throw new Error('Invalid live data');
          if(!cached||attemptedTime(value.status)>=attemptedTime(cached.status))cached=value;
          if(now()-attemptedTime(value.status)<=180000)break;
        }catch{}finally{clearTimeout(timer);}
      }
      return cached;
    })().finally(()=>{inflight=null;});
    return inflight;
  };
}
