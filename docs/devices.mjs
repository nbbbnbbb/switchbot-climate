// Apply the same display selection to the dashboard and placement settings.
// Collection and stored history are independent of what is displayed.
export function visibleClimateSensors(sensors=[]) {
  return sensors.filter(s=>{
    const name=(s.name??'').normalize('NFKC').replace(/\s/g,'');
    return !['sensor-b8a1a0585a7f','sensor-40754d56e91d'].includes(s.id)
      && s.kind!=='hub' && !/^Hub Mini/.test(s.deviceType??'')
      && !name.startsWith('ハブミニ') && !/CO2/i.test(name+' '+(s.deviceType??''));
  });
}
