(()=>{
'use strict';
if(window.__mclComposeIsolationV2)return;window.__mclComposeIsolationV2=true;
/* v2 owns composition-state/CLAB semantics; prevent the legacy capture-phase saver
   from turning a finished-score summary into a supposed pre-composition concept. */
window.__mclCompositionStateFixV119=true;
const VERSION='2.0.0-alpha.4';
const sessionFetch=window.fetch.bind(window);
const minimalFetch=window.__MCL_MINIMAL_FETCH;
if(!minimalFetch){console.warn('MusicChatLab 2.0: minimal fetch path missing.');return;}
const TECH=`TECHNISCHE AUSGABEANFORDERUNG – KEINE MUSIKALISCHEN ZUSATZREGELN:
Antworte ausschließlich mit validem JSON, ohne Markdown und ohne Text außerhalb des JSON.
Die Partitur steht entweder direkt im Wurzelobjekt oder im Feld "score".
Partiturformat:
{
  "title": "optional",
  "bpm": Zahl,
  "timeSignature": [Zaehler, Nenner],
  "tracks": [
    {
      "name": "Instrument",
      "program": 0-127,
      "channel": 0-15,
      "notes": [[StartBeat, DauerInBeats, MIDIPitch, Velocity], ...]
    }
  ]
}
Weitere Textfelder, die der Benutzer in seinem Auftrag ausdrücklich verlangt, dürfen zusätzlich im JSON stehen.
StartBeat und DauerInBeats dürfen Dezimalzahlen sein. MIDI-Pitch 0-127, Velocity 1-127.
Das technische Format macht keinerlei Vorgaben zu Stil, Harmonik, Melodik, Rhythmik, Form, Artikulation oder musikalischer Qualität.`;
function providerFor(url){const u=String(url||'');if(u.includes('api.anthropic.com/v1/messages'))return'anthropic';if(u.includes('api.openai.com/v1/responses'))return'openai';if(u.includes('generativelanguage.googleapis.com/')&&u.includes(':generateContent'))return'google';return null}
function textOf(x){if(typeof x==='string')return x;if(Array.isArray(x))return x.map(p=>p?.text||p?.input_text||p?.output_text||'').join('');return''}
function lastUser(provider,b){if(provider==='anthropic'){const a=Array.isArray(b.messages)?b.messages:[];for(let i=a.length-1;i>=0;i--)if(a[i]?.role==='user')return textOf(a[i].content)}if(provider==='openai'){const a=Array.isArray(b.input)?b.input:[];for(let i=a.length-1;i>=0;i--)if(a[i]?.role==='user')return textOf(a[i].content)}if(provider==='google'){const a=Array.isArray(b.contents)?b.contents:[];for(let i=a.length-1;i>=0;i--)if(a[i]?.role==='user')return textOf(a[i].parts)}return''}
function stripContext(s){return String(s||'').replace(/\n*--- MUSIKALISCHER ARBEITSTISCH(?: \(KATALOG\))? ---[\s\S]*?--- ENDE MUSIKALISCHER ARBEITSTISCH(?: \(KATALOG\))? ---\n*/g,'\n').replace(/\n*--- AUSGEWÄHLTES MUSIKMATERIAL ---[\s\S]*?--- ENDE AUSGEWÄHLTES MUSIKMATERIAL ---\n*/g,'\n').replace(/\n*--- AUTOMATISCH BEREITGESTELLTES MUSIKMATERIAL ---[\s\S]*?--- ENDE AUTOMATISCH BEREITGESTELLTES MUSIKMATERIAL ---\n*/g,'\n').replace(/\n{3,}/g,'\n\n').trim()}
function refersToExisting(s){return /\b(?:Speicher(?:platz)?\s*\d+|dieses Stück|diese Komposition|aktuelle Komposition|davon|daraus|vorhandene(?:s|n)? Stück)\b/i.test(String(s||''))}
function miniPrompt(user){return`${user}\n\n${TECH}`}
function minimalBody(provider,b,user){const prompt=miniPrompt(user);if(provider==='anthropic')return{model:b.model,max_tokens:32768,messages:[{role:'user',content:prompt}]};if(provider==='openai')return{model:b.model,input:[{role:'user',content:[{type:'input_text',text:prompt}]}],store:false};return{contents:[{role:'user',parts:[{text:prompt}]}]}}
function responseText(provider,d){if(provider==='anthropic')return(d?.content||[]).filter(x=>x?.type==='text').map(x=>x.text||'').join('').trim();if(provider==='openai')return(d?.output||[]).flatMap(x=>x?.content||[]).filter(x=>x?.type==='output_text'||x?.type==='text').map(x=>x?.text||'').join('\n').trim()||String(d?.output_text||'').trim();return(d?.candidates?.[0]?.content?.parts||[]).map(x=>x?.text||'').join('\n').trim()}
function parseJson(text){let s=String(text||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');const a=s.indexOf('{'),b=s.lastIndexOf('}');if(a<0||b<a)return null;try{return JSON.parse(s.slice(a,b+1))}catch{return null}}
function toInternal(x){if(!x||typeof x!=='object')return null;if(Array.isArray(x.tr))return x;const root=(x.score&&typeof x.score==='object')?x.score:x;if(!Array.isArray(root.tracks))return null;const ts=Array.isArray(root.timeSignature)?root.timeSignature:[4,4],out={ti:String(root.title||x.title||'KI-Komposition'),bpm:Number(root.bpm)||96,ts:{n:Number(ts[0])||4,d:Number(ts[1])||4},k:String(root.key||root.keySignature||''),tr:root.tracks.map((t,i)=>({nm:String(t?.name||`Spur ${i+1}`),ch:Math.max(0,Math.min(15,Number(t?.channel)||0)),pg:Math.max(0,Math.min(127,Number(t?.program)||0)),nt:(Array.isArray(t?.notes)?t.notes:[]).filter(n=>Array.isArray(n)&&n.length>=4).map(n=>[Number(n[0])||0,Number(n[1])||0,Number(n[2])||0,Number(n[3])||80,0,1]),ct:[]}))};const idea=x.kompositionsidee||x.idea||root.kompositionsidee||root.idea;if(idea)out.idea=String(idea);const desc=root.description||root.summary;if(desc)out.sm=String(desc);return out}
function replaceResponseText(provider,d,text){const x=JSON.parse(JSON.stringify(d||{}));if(provider==='anthropic'){let done=false;x.content=(x.content||[]).map(p=>{if(!done&&p?.type==='text'){done=true;return{...p,text}}return p});if(!done)x.content=[...(x.content||[]),{type:'text',text}]}else if(provider==='openai'){let done=false;x.output=(x.output||[]).map(o=>({...o,content:(o.content||[]).map(p=>{if(!done&&(p?.type==='output_text'||p?.type==='text')){done=true;return{...p,text}}return p})}));if(typeof x.output_text==='string')x.output_text=text}else{if(!x.candidates?.length)x.candidates=[{}];x.candidates[0]={...(x.candidates[0]||{}),content:{...(x.candidates[0]?.content||{}),role:'model',parts:[{text}]}}}return x}
function jsonResponse(data,r){const h=new Headers(r.headers||{});h.set('content-type','application/json');return new Response(JSON.stringify(data),{status:r.status,statusText:r.statusText,headers:h})}
function ideaPrompt(user,finished){return`Die folgende Komposition ist bereits vollständig fertig. Formuliere jetzt nachträglich in höchstens drei kurzen Sätzen die musikalische Kompositionsidee, die sich aus dem fertigen Stück erkennen lässt. Beschreibe nur das vorhandene Stück; erfinde keine neue Vorgabe und ändere nichts an der Komposition. Antworte ausschließlich mit der Kompositionsidee, ohne Überschrift.\n\nUrsprünglicher Auftrag:\n${user}\n\nFertige Partitur:\n${JSON.stringify(finished)}`}
function ideaBody(provider,b,prompt){if(provider==='anthropic')return{model:b.model,max_tokens:800,messages:[{role:'user',content:prompt}]};if(provider==='openai')return{model:b.model,input:[{role:'user',content:[{type:'input_text',text:prompt}]}],store:false};return{contents:[{role:'user',parts:[{text:prompt}]}]}}
function cleanIdea(s){let x=String(s||'').replace(/^```[\s\S]*?\n?/,'').replace(/```$/,'').replace(/^#{1,6}\s*/gm,'').replace(/^Kompositionsidee\s*[:\-]\s*/i,'').replace(/\s+/g,' ').trim();if(x.length>600)x=x.slice(0,597).replace(/\s+\S*$/,'')+'…';return x}
async function generatePostIdea(provider,input,init,body,user,finished){try{const note=document.getElementById('composerNote');if(note)note.textContent='Komposition fertig · Kompositionsidee wird erst jetzt nachträglich formuliert …';const r=await minimalFetch(input,{...init,body:JSON.stringify(ideaBody(provider,body,ideaPrompt(user,finished)))});if(!r.ok)return'';const d=await r.clone().json();return cleanIdea(responseText(provider,d))}catch(e){console.warn('Nachträgliche Kompositionsidee konnte nicht erzeugt werden',e);return''}}
function activeScore(){try{const b=document.querySelector('.mcl-midi-slot.active');if(!b||!window.MCLMidiSlots?.get)return null;return window.MCLMidiSlots.get([Number(b.dataset.slot)+1])?.[0]?.score||null}catch{return null}}
function showIdeaFromActive(){const s=activeScore(),box=document.getElementById('compositionIdeaInput');if(!box||!s)return;const idea=String(s.idea||'').trim();if(window.MCLCompositionIdea?.set)window.MCLCompositionIdea.set(idea,{generated:false,source:'post-compose'});else box.value=idea}
function installIdeaDisplay(){const label=document.querySelector('.composition-idea-box label');if(label)label.innerHTML='Kompositionsidee <span style="font-weight:400;opacity:.7">(nachträglich aus dem fertigen Stück erzeugt; beeinflusst die Komposition nicht)</span>';const slots=document.getElementById('midiSlots');if(slots)slots.addEventListener('click',()=>setTimeout(showIdeaFromActive,90),true);const messages=document.getElementById('messages');if(messages)new MutationObserver(()=>{setTimeout(showIdeaFromActive,280);setTimeout(showIdeaFromActive,850)}).observe(messages,{childList:true});}
window.fetch=async function(input,init={}){
 const url=typeof input==='string'?input:input?.url||'',provider=providerFor(url);
 if(!provider||window.MCLRequestMode!=='compose'||typeof init.body!=='string')return sessionFetch(input,init);
 let body;try{body=JSON.parse(init.body)}catch{return sessionFetch(input,init)}
 const raw=lastUser(provider,body),hasScore=/\[MCL-ENGINE14-SCORE\b/i.test(raw),user=stripContext(raw);
 if(hasScore||refersToExisting(user))return sessionFetch(input,init);
 if(!user)return sessionFetch(input,init);
 const note=document.getElementById('composerNote');if(note)note.textContent='Isolierte Neukomposition · exakt derselbe Modellauftrag wie im Minimal Composer.';
 const r=await minimalFetch(input,{...init,body:JSON.stringify(minimalBody(provider,body,user))});
 if(!r.ok)return r;let data;try{data=await r.clone().json()}catch{return r}const finished=parseJson(responseText(provider,data)),internal=toInternal(finished);if(!internal)return r;
 const postIdea=await generatePostIdea(provider,input,init,body,user,finished);if(postIdea)internal.idea=postIdea;
 setTimeout(showIdeaFromActive,350);setTimeout(showIdeaFromActive,950);
 if(note)note.textContent=postIdea?'Komposition erzeugt · Kompositionsidee nachträglich ergänzt.':'Komposition erzeugt · nachträgliche Idee konnte nicht erzeugt werden.';
 return jsonResponse(replaceResponseText(provider,data,JSON.stringify(internal)),r);
};
function finishAlpha4Ui(){
 document.title='MusicChatLab 2.0 Alpha 4';
 const hidden=document.querySelector('[data-app-version]');if(hidden)hidden.textContent='v2.0.0-alpha.4';
 const sub=document.querySelector('.brand-subtitle');if(sub)sub.textContent='Version 2.0 Alpha 4';
 const badge=document.querySelector('.version-badge');if(badge)badge.textContent='v2.0 α4';
 const about=document.querySelector('.about-version span');if(about)about.textContent='v2.0.0 Alpha 4';
 const meta=document.querySelector('.about-meta');if(meta)meta.textContent='Exakter Minimal-Composer-Aufruf · Kompositionsidee erst nach fertiger Komposition · Chat-Gedächtnis nur im Chat/Bearbeitungsweg · Fable 5.1 · Kostenkontrolle 2.0';
 installIdeaDisplay();
 if(!window.__mclClabSaveV2){const s=document.createElement('script');s.src='clab-save-v2.js?v=2.0.0a4';document.head.appendChild(s)}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',finishAlpha4Ui,{once:true});else finishAlpha4Ui();
window.MCLComposeIsolationV2={version:VERSION};
})();
