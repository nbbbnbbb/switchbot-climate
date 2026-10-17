export const PERIOD_HOURS=[1,6,24,168,720,2160];
export const DEFAULT_SETTINGS={
  schemaVersion:1,
  axes:{temperature:{min:null,max:null},humidity:{min:null,max:null}},
  defaultPeriodHours:24,defaultMetric:'temperature',visibleSensorIds:null,
  refreshSeconds:60,gapMinutes:20,staleMinutes:5,
  showPoints:false,showCards:true,showSummary:true,showReadings:true,lineWidth:2,
};
export function normalizeSettings(input={}) {
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('設定の形式が正しくありません。');
  if(input.schemaVersion!==undefined&&input.schemaVersion!==1)throw new Error('この設定のバージョンには対応していません。');
  const result=structuredClone(DEFAULT_SETTINGS);
  for(const metric of ['temperature','humidity']){
    const range=metric==='temperature'?[-100,150]:[0,100];
    const raw=input.axes?.[metric]??{};
    for(const side of ['min','max']){
      const v=raw[side]??null;
      if(v!==null&&(typeof v!=='number'||!Number.isFinite(v)||v<range[0]||v>range[1]))throw new Error((metric==='temperature'?'温度':'湿度')+'の範囲を正しく入力してください。');
      result.axes[metric][side]=v;
    }
    const {min,max}=result.axes[metric];
    if((min!==null&&max!==null&&min>=max)||min===range[1]||max===range[0])throw new Error('最小値は最大値より小さくしてください。');
  }
  for(const [key,allowed]of Object.entries({defaultPeriodHours:PERIOD_HOURS,refreshSeconds:[15,30,60,120,300],lineWidth:[1,2,3,4]})){
    const value=input[key]??result[key];if(!allowed.includes(value))throw new Error('設定項目の値が正しくありません。');result[key]=value;
  }
  result.defaultMetric=input.defaultMetric??result.defaultMetric;
  if(!['temperature','humidity'].includes(result.defaultMetric))throw new Error('表示項目が正しくありません。');
  for(const [key,min,max]of [['gapMinutes',2,120],['staleMinutes',3,60]]){
    const value=input[key]??result[key];if(!Number.isInteger(value)||value<min||value>max)throw new Error('時間の設定値が範囲外です。');result[key]=value;
  }
  for(const key of ['showPoints','showCards','showSummary','showReadings']){
    if(input[key]!==undefined&&typeof input[key]!=='boolean')throw new Error('表示設定が正しくありません。');result[key]=input[key]??result[key];
  }
  if(input.visibleSensorIds!==undefined&&input.visibleSensorIds!==null){
    if(!Array.isArray(input.visibleSensorIds)||!input.visibleSensorIds.length||input.visibleSensorIds.some(id=>typeof id!=='string'||!/^[a-z0-9-]{1,48}$/.test(id)))throw new Error('表示するセンサーを1台以上選択してください。');
    result.visibleSensorIds=[...new Set(input.visibleSensorIds)].sort();
  }
  return result;
}
export function axisDomain(values,metric,bounds={min:null,max:null}) {
  let low=Infinity,high=-Infinity;
  for(const value of values)if(Number.isFinite(value)){low=Math.min(low,value);high=Math.max(high,value);}
  if(!Number.isFinite(low)){low=metric==='temperature'?15:30;high=metric==='temperature'?30:80;}
  const pad=Math.max((high-low)*.15,metric==='temperature'?1:3);
  let min=bounds.min??Math.floor(low-pad),max=bounds.max??Math.ceil(high+pad);
  if(metric==='humidity'){if(bounds.min===null||bounds.min===undefined)min=Math.max(0,min);if(bounds.max===null||bounds.max===undefined)max=Math.min(100,max);}
  if(min>=max){if(bounds.max===null||bounds.max===undefined)max=min+(metric==='temperature'?2:5);else min=max-(metric==='temperature'?2:5);}
  if(metric==='humidity'){min=Math.max(0,min);max=Math.min(100,max);}
  return {min,max};
}
