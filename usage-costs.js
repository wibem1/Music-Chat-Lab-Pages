(()=>{
'use strict';
const CHAT_KEY='music-chat-lab.chats.v1';
const ACTIVE_KEY='music-chat-lab.active-chat.v1';
const LEGACY_KEY='music-chat-lab.cost-control.v1';
function price(model,inputTokens=0){let i=0,o=0,c=null;switch(String(model||'')){case'gpt-5.6-sol':i=4;o=20;c=.4;break;case'gpt-5.6-terra':i=2;o=12;c=.2;break;case'gpt-5.6-luna':i=.2;o=1.2;c=.02;break;case'claude-sonnet-5':i=2;o=10;c=.2;break;case'claude-opus-5':i=5;o=25;c=.5;break;case'claude-sonnet-4-6':i=3;o=15;c=.3;break;case'gemini-3.8-flash':case'gemini-3.7-flash':i=.75;o=3.75;c=.1875;break;case'gemini-3.1-pro-preview':i=inputTokens>200000?4:2;o=inputTokens>200000?18:12;c=i/4;break;default:i=4;o=20;c=.4}if(/^gpt-5\.6-/.test(String(model||''))&&inputTokens>272000){i*=2;o*=1.5;c*=2}return{i,o,c}}
function callCost(x){const p=price(x.model,x.input||0),cached=Math.min(Number(x.cached)||0,Number(x.input)||0),normal=Math.max(0,(Number(x.input)||0)-cached),cacheWrite=Number(x.cacheWrite)||0;return(normal*p.i+cached*(p.c??p.i)+cacheWrite*p.i*1.25+(Number(x.output)||0)*p.o)/1e6}
function fmt(n){return Math.round(Number(n)||0).toLocaleString('de-DE')}
function money(n){return Number(n||0).toLocaleString('de-DE',{minimumFractionDigits:3,maximumFractionDigits:4})+' US$'}
function exact(){const x=window.MCLUsageData?.()||{calls:[]},calls=x.calls||[];return{calls,input:calls.reduce((n,a)=>n+(a.input||0),0),cached:calls.reduce((n,a)=>n+(a.cached||0),0),output:calls.reduce((n,a)=>n+(a.output||0),0),cost:calls.reduce((n,a)=>n+callCost(a),0)}}
function legacy(){try{return JSON.parse(localStorage.getItem(LEGACY_KEY)||'{}')||{}}catch{return{}}}
function chats(){try{return JSON.parse(localStorage.getItem(CHAT_KEY)||'[]')||[]}catch{return[]}}
function activeChat(){const all=chats(),id=localStorage.getItem(ACTIVE_KEY);return all.find(c=>c.id===id)||all[0]||null}
function usageCost(u){const p=price(u?.model,u?.input||0),cached=Math.min(Number(u?.cached)||0,Number(u?.input)||0),normal=Math.max(0,(Number(u?.input)||0)-cached),cacheWrite=Number(u?.cacheWrite)||0;return(normal*p.i+cached*(p.c??p.i)+cacheWrite*p.i*1.25+(Number(u?.output)||0)*p.o)/1e6}
function inferAction(c,i,m){if(m?.usage?.action&&m.usage.action!=='Chat')return m.usage.action;for(let j=i-1;j>=0;j--){const x=c.messages[j];if(x?.role==='user')return window.MCLUsageClassifyAction?.(x.text)||'Chat'}return'Chat'}
function render(){
 const x=exact(),old=legacy(),el=document.getElementById('costControl');
 if(el){const cached=x.cached?` · davon ${fmt(x.cached)} gecacht`:'';const legacyText=old.tokens?` · Altbestand vor v1.1.1: ≈ ${fmt(old.tokens)} Input-Tokens / ${old.calls||0} Anfragen (nur geschätzt)`:'';el.textContent=`API-Daten seit v1.1.1: ${fmt(x.input)} Input${cached} · ${fmt(x.output)} Output · ${x.calls.length} echte API-Aufrufe · geschätzte Kosten: ≈ ${money(x.cost)}${legacyText}`}
 const c=activeChat();if(!c)return;const rows=[...document.querySelectorAll('.message-row')];
 for(let i=0;i<(c.messages||[]).length;i++){
  const m=c.messages[i];if(m?.role!=='assistant'||!m.usage||m.isError||m.thinking)continue;
  const row=rows[i];if(!row||row.querySelector('.mcl-action-cost'))continue;
  const u=m.usage,action=inferAction(c,i,m),d=document.createElement('div');d.className='mcl-action-cost';d.style.cssText='font-size:12px;color:#7b8794;margin-top:5px';
  d.textContent=`API-Aufwand · ${action}: ${fmt(u.input)} Input${u.cached?` (${fmt(u.cached)} gecacht)`:''} + ${fmt(u.output)} Output · ${u.calls||0} API-Aufrufe · ≈ ${money(usageCost(u))}`;row.appendChild(d)
 }
}
window.MCLUsageRender=render;let busy=false;function schedule(){if(busy)return;busy=true;setTimeout(()=>{busy=false;render()},80)}function start(){render();new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true,characterData:true});window.addEventListener('mcl-usage-updated',schedule)}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();