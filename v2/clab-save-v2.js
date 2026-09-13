(()=>{
'use strict';
if(window.__mclClabSaveV2)return;window.__mclClabSaveV2=true;
const APPLE_EPOCH=978307200,clone=x=>x==null?x:JSON.parse(JSON.stringify(x)),clean=s=>String(s||'').trim();
function activeSlot(){const b=document.querySelector('.mcl-midi-slot.active');return b?Number(b.dataset.slot)+1:0}
function currentIdea(){return clean(window.MCLCompositionIdea?.get?.()||document.getElementById('compositionIdeaInput')?.value||'')}
function currentChat(){try{const chats=JSON.parse(localStorage.getItem('music-chat-lab.chats.v1')||'[]'),id=localStorage.getItem('music-chat-lab.active-chat.v1');return chats.find(c=>c.id===id)||chats[0]||null}catch{return null}}
function latestAssignment(){const c=currentChat();if(!c)return'';const m=[...(c.messages||[])].reverse().find(x=>x.role==='user'&&!x.isError&&!x.thinking);return String(m?.displayText||m?.text||'').replace(/\[MCL-(?:ENGINE14-SCORE|CLAB-SCORE)[\s\S]*$/i,'').trim()}
function measures(score){let end=0;for(const t of score?.tr||[])for(const n of t.nt||[])if(Array.isArray(n))end=Math.max(end,(Number(n[0])||0)+(Number(n[1])||0));const ts=score?.ts||{n:4,d:4},bar=(Number(ts.n)||4)*(4/(Number(ts.d)||4));return String(Math.max(1,Math.ceil(end/Math.max(.25,bar))))}
function ensemble(score){return(score?.tr||[]).map(t=>t.nm).filter(Boolean).join(', ')}
function safe(v){return String(v||'Komposition').replace(/[\\/:*?"<>|]+/g,'_').replace(/\s+/g,' ').trim()||'Komposition'}
function download(text,name){const blob=new Blob([text],{type:'application/json'}),u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1500)}
function setNote(s){const e=document.getElementById('composerNote');if(e)e.textContent=s}
function save(){const api=window.MCLMidiSlots,slot=activeSlot();if(!api?.all||!slot)throw new Error('Kein Stück auf dem Arbeitstisch markiert.');const item=(api.all()||[]).find(x=>Number(x.slot)===slot&&x.score);if(!item)throw new Error('Der markierte Speicherplatz enthält keine Komposition.');const score=clone(item.score),title=clean(score.ti)||clean(item.name)||'Komposition',old=window.MCLCLAB?.getLoadedDocument?.()||null,same=!!old&&JSON.stringify(old.score)===JSON.stringify(score),idea=currentIdea()||(same?clean(old?.concept):'');score.ti=title;const p=document.getElementById('providerSelect')?.value||'',model=document.getElementById('modelSelect')?.value||null;const doc={format:'composition-lab-document',version:1,savedAt:Date.now()/1000-APPLE_EPOCH,title,score,concept:idea,provider:p==='google'?'gemini':p||null,model,measures:measures(score),meter:`${score.ts?.n||4}/${score.ts?.d||4}`,tempo:String(score.bpm||96),musicalKey:String(score.k||''),ensemble:ensemble(score),assignment:latestAssignment()};download(JSON.stringify(doc,null,2),safe(title)+'.clab');setNote(`CLAB gespeichert: ${title}. Kompositionsidee und nachträgliche Score-Beschreibung bleiben getrennt.`)}
function install(){const b=document.getElementById('clabSaveBtn');if(!b)return;b.onclick=e=>{e?.preventDefault?.();try{save()}catch(err){setNote(err?.message||String(err))}}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
window.MCLClabSaveV2={save};
})();
