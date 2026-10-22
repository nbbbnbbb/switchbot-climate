const MINUTE=60000;

// A null anchor follows the live clock; a timestamp holds a historical window.
export function timeWindow(rows,duration,latest,anchor=null){
  let earliest=latest;
  for(const row of rows){const at=Date.parse(row.at);if(Number.isFinite(at)&&at<earliest)earliest=at;}
  const minEnd=Math.min(latest,earliest+duration),maxEnd=latest;
  const end=anchor===null?latest:Math.max(minEnd,Math.min(latest,anchor));
  const maxPosition=Math.ceil((maxEnd-minEnd)/MINUTE);
  return{start:end-duration,end,earliest,minEnd,maxEnd,maxPosition,
    position:Math.min(maxPosition,Math.round((end-minEnd)/MINUTE)),following:anchor===null,disabled:maxPosition===0};
}

export function anchorAtPosition(window,position){
  const value=Math.max(0,Math.min(window.maxPosition,Number(position)||0));
  return value>=window.maxPosition?null:window.minEnd+value*MINUTE;
}

export function rowsInWindow(rows,start,end){
  return rows.filter(row=>{const at=Date.parse(row.at);return at>=start&&at<=end;});
}
