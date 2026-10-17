import {normalizeSettings} from './settings-model.mjs?v=2';
export const REPOSITORY='nbbbnbbb/switchbot-climate';
const ENDPOINT=`https://api.github.com/repos/${REPOSITORY}/contents/docs/settings.json`;
export async function readSharedSettings(fetcher=fetch){
  const response=await fetcher('./settings.json?t='+Date.now(),{cache:'no-store'});
  if(!response.ok)throw new Error('共有設定を読み込めませんでした。');
  return normalizeSettings(await response.json());
}
export async function saveSharedSettings(settings,token,expectedSha,fetcher=fetch){
  const clean=normalizeSettings(settings);
  if(typeof token!=='string'||!token.trim())throw new Error('共有設定の保存には管理者認証が必要です。');
  if(!expectedSha)throw new Error('保存前に最新の共有設定を読み込んでください。');
  const bytes=new TextEncoder().encode(JSON.stringify(clean,null,2)+'\n');
  let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
  const response=await fetcher(ENDPOINT,{method:'PUT',headers:{Authorization:'Bearer '+token.trim(),Accept:'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'},body:JSON.stringify({message:'Update shared dashboard settings',content:btoa(binary),sha:expectedSha,branch:'main'})});
  if(response.status===409||response.status===422)throw new Error('他の管理者が設定を更新した可能性があります。「共有設定を再読込」してから保存してください。');
  if(response.status===401||response.status===403||response.status===404)throw new Error('保存権限を確認できません。対象リポジトリのContents: Read and writeを持つGitHubトークンを確認してください。');
  if(!response.ok)throw new Error('共有設定を保存できませんでした。通信状態を確認してください。');
  const result=await response.json();return {settings:clean,sha:result.content.sha};
}
export async function readRepositorySettings(token='',fetcher=fetch){
  const headers={Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
  if(token.trim())headers.Authorization='Bearer '+token.trim();
  const response=await fetcher(ENDPOINT+'?ref=main&t='+Date.now(),{headers,cache:'no-store'});
  if(!response.ok)throw new Error('最新の共有設定を確認できませんでした。通信状態とGitHub認証を確認してください。');
  const file=await response.json();
  const bytes=Uint8Array.from(atob(file.content.replace(/\s/g,'')),c=>c.charCodeAt(0));
  return {settings:normalizeSettings(JSON.parse(new TextDecoder().decode(bytes))),sha:file.sha};
}
