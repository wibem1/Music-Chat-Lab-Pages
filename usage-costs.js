(()=>{
'use strict';
const CHAT_KEY='music-chat-lab.chats.v1';
const ACTIVE_KEY='music-chat-lab.active-chat.v1';
function price(model,inputTokens=0){let i=0,o=0,c=null;switch(String(model||'')){case'gpt-5.6-sol':i=4;o=20;c=.4;break;case'gpt-5.6-terra':i=2;o=12;c=.2;break;case'gpt-5.6-luna':i=.2;o=1.2;c=.02;break;case'claude-sonnet-5':i=2;o=10;c=.2;break;case'claude-opus-5':i=5;o=25;c=.5;break;case'claude-sonnet-4-6':i=3;o=15;c=.3;break;case'gemini-3.8-flash':case'gemini-3.7-flash':i=.75;o=3.75;c=.1875;break;case'gemini-3.1-pro-preview':i=inputTokens>200000?4:2;o=inputTokens>200000?18:12;c=i/4;break;default:i=4;o=20;c=.4}if(/^gpt-5\.6-/.test(String(model||''))&&inputTokens>272000){i*=2;o*=1.5;c*=2}return{i,o,c}}
function fmt(n){return Math.round(Number(n)||0).toLocaleString('de-DE')}
function money(n){return Number(n||0).toLocaleString('de-DE',{minimumFractionDigits:3,maximumFractionDigits:4})+' US$'}
function chats(){try{return JSON.parse(localStorage.getItem(CHAT_KEY)||'[]')||[]}catch{return[]}}
function activeChat(){const all=chats(),id=localStorage.getItem(ACTIVE_KEY);return all.find(c=>c.id===id)||all[0]||null}
function usageCost(u){const p=price(u?.model,u?.input||0),cached=Math.min(Number(u?.cached)||0,Number(u?.input)||0),normal=Math.max(0,(Number(u?.input)||0)-cached),cacheWrite=Number(u?.cacheWrite)||0;return(normal*p.i+cached*(p.c??p.i)+cacheWrite*p.i*1.25+(Number(u?.output)||0)*p.o)/1e6}
function chatCost(c){return(c?.messages||[]).reduce((sum,m)=>sum+(m?.role==='assistant'&&m?.usage&&!m?.isError&&!m?.thinking?usageCost(m.usage):0),0)}
function isConfirmation(text){return /^(ja|ja bitte|mach das|mache das|genau|einverstanden|okay|ok|los|bitte|so machen|ausführen|führe (das|ihn|sie) aus)[.!\s]*$/i.test(String(text||'').trim())}
function inferAction(c,i,m){if(m?.usage?.action&&m.usage.action!=='Chat')return m.usage.action;for(let j=i-1;j>=0;j--){const x=c.messages[j];if(x?.role!=='user')continue;if(isConfirmation(x.text)){for(let k=j-1;k>=0;k--){const prev=c.messages[k];if(prev?.role==='user'&&!isConfirmation(prev.text)){const a=window.MCLUsageClassifyAction?.(prev.text)||'Chat';if(a!=='Chat')return a}}}return window.MCLUsageClassifyAction?.(x.text)||'Chat'}return'Chat'}
function render(){
 const c=activeChat(),el=document.getElementById('costControl');
 if(el)el.textContent=c?`Kosten dieses Chats: ≈ ${money(chatCost(c))}`:'Kosten dieses Chats: ≈ 0,000 US$';
 if(!c)return;const rows=[...document.querySelectorAll('.message-row')];
 for(let i=0;i<(c.messages||[]).length;i++){
  const m=c.messages[i];if(m?.role!=='assistant'||!m.usage||m.isError||m.thinking)continue;
  const row=rows[i];if(!row||row.querySelector('.mcl-action-cost'))continue;
  const u=m.usage,action=inferAction(c,i,m),d=document.createElement('div');d.className='mcl-action-cost';d.style.cssText='font-size:12px;color:#4f8a61;margin-top:5px';
  d.textContent=`API-Aufwand · ${action}: ${fmt(u.input)} Input${u.cached?` (${fmt(u.cached)} gecacht)`:''} + ${fmt(u.output)} Output · ${u.calls||0} API-Aufrufe · ≈ ${money(usageCost(u))}`;row.appendChild(d)
 }
}
window.MCLUsageRender=render;let busy=false;function schedule(){if(busy)return;busy=true;setTimeout(()=>{busy=false;render()},80)}function start(){render();new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true,characterData:true});window.addEventListener('mcl-usage-updated',schedule)}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();