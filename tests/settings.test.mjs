import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_SETTINGS,normalizeSettings,axisDomain} from '../docs/settings-model.mjs';
import {saveSharedSettings,readRepositorySettings} from '../docs/settings-store.mjs';
test('shared bounds support automatic, fixed and independent min/max',()=>{
  assert.deepEqual(axisDomain([20,22],'temperature',{min:10,max:30}),{min:10,max:30});
  assert.deepEqual(axisDomain([20,22],'temperature',{min:10,max:null}),{min:10,max:23});
  const automatic=axisDomain([20,22],'temperature');assert.ok(automatic.min<20&&automatic.max>22);
  const changed=normalizeSettings({axes:{temperature:{min:15,max:25}}});assert.equal(changed.axes.humidity.min,null);
});
test('invalid shared ranges and invalid options cannot be persisted',()=>{
  for(const input of [{axes:{temperature:{min:30,max:20}}},{axes:{humidity:{min:-1}}},{refreshSeconds:0},{visibleSensorIds:[]},{axes:{temperature:{min:NaN}}},{showCards:'false'}])assert.throws(()=>normalizeSettings(input));
});
test('shared settings only serialize known display fields, never credentials',async()=>{
  let submitted;
  const result=await saveSharedSettings({...DEFAULT_SETTINGS,token:'must-not-publish',secret:'must-not-publish'},'test-admin-token','old-sha',async(url,options)=>{
    assert.equal(options.headers.Authorization,'Bearer test-admin-token');submitted=JSON.parse(options.body);
    return {ok:true,status:200,json:async()=>({content:{sha:'new-sha'}})};
  });
  assert.equal(result.sha,'new-sha');assert.equal(submitted.sha,'old-sha');assert.equal(submitted.branch,'main');
  const decoded=Buffer.from(submitted.content,'base64').toString();assert.ok(!decoded.includes('must-not-publish'));assert.ok(!decoded.includes('test-admin-token'));
});
test('concurrent administrator changes fail without overwriting shared settings',async()=>{
  await assert.rejects(()=>saveSharedSettings(DEFAULT_SETTINGS,'test-token','old-sha',async()=>({ok:false,status:409})),/共有設定を再読込/);
});
test('anonymous users cannot send a settings write',async()=>{
  let requests=0;await assert.rejects(()=>saveSharedSettings(DEFAULT_SETTINGS,'','old-sha',async()=>{requests++;}),/管理者認証/);assert.equal(requests,0);
});
test('repository shared settings preserve Japanese text and version for all viewers',async()=>{
  const settings={...DEFAULT_SETTINGS,defaultMetric:'humidity'};
  const result=await readRepositorySettings('',async()=>({ok:true,json:async()=>({sha:'same-global-version',content:Buffer.from(JSON.stringify(settings)).toString('base64')})}));
  assert.equal(result.sha,'same-global-version');assert.equal(result.settings.defaultMetric,'humidity');
});
