(()=>{
'use strict';
if(window.__mclSessionLocalOpsV131)return;
window.__mclSessionLocalOpsV131=true;
const VERSION='1.3.1';
const innerFetch=window.fetch.bind(window);
const clone=x=>x==null?x:JSON.parse(JSON.stringify(x));
const ACTION_OPEN='<MCL_ACTION>';
const ACTION_CLOSE='</MCL_ACTION>';

function providerFor(url){
  const u=String(url||'');
  if(u.includes('api.anthropic.com/v1/messages'))return'anthropic';
  if(u.includes('api.openai.com/v1/responses'))return'openai';
  if(u.includes('generativelanguage.googleapis.com/')&&u.includes(':generateContent'))return'google';
  return null;
}
function latestUser(provider,body){
  let items=[];
  if(provider==='anthropic')items=Array.isArray(body?.messages)?body.messages:[];
  else if(provider==='openai')items=Array.isArray(body?.input)?body.input:[];
  else items=Array.isArray(body?.contents)?body.contents:[];
  for(let i=items.length-1;i>=0;i--){
    const m=items[i],role=provider==='google'?(m?.role==='model'?'assistant':'user'):m?.role;
    if(role!=='user')continue;
    if(typeof m?.content==='string')return m.content;
    if(Array.isArray(m?.content))return m.content.map(x=>x?.text||x?.input_text||'').join('');
    if(Array.isArray(m?.parts))return m.parts.map(x=>x?.text||'').join('');
  }
  return'';
}
function sources(){
  try{return(window.MCLMidiWorkspaceSources?.()||window.MCLMidiSlots?.all?.()||[]).filter(x=>x?.score?.tr?.length).map(x=>({slot:Number(x.slot),name:x.name||x.score?.ti||`Speicher ${x.slot}`,score:clone(x.score)}))}catch{return[]}
}
function activeSlot(){try{const b=document.querySelector('.mcl-midi-slot.active');return b?Number(b.dataset.slot)+1:0}catch{return 0}}
function pureAssembly(text){
  const u=String(text||'').toLowerCase();
  const asksOutput=/(midi|datei|zusammen|zusammenführ|kombinier|verbinde|gemeinsame? fassung|mit .*begleitung|begleitung .*mit)/.test(u);
  const asksNewMusic=/\b(komponiere|komponier|komponieren|überarbeite|ueberarbeite|überarbeiten|ueberarbeiten|variiere|variier|variieren|verändere|veraendere|ändere|aendere|fortsetze|fortsetzen|erweitere|erweitern|harmonisiere|harmonisieren|arrangiere|arrangieren)\b/.test(u)||/\b(neue|neuen|neuer)\s+(melodie|stimme|komposition)\b/.test(u);
  return asksOutput&&!asksNewMusic;
}
function explicitSlots(text,all){
  const valid=new Set(all.map(x=>x.slot)),out=[];const add=n=>{n=Number(n);if(valid.has(n)&&!out.includes(n))out.push(n)};
  for(const m of String(text||'').matchAll(/(?:speicher(?:platz)?|platz|slot)\s*(?:nr\.?\s*)?([1-6])/gi))add(m[1]);
  return out;
}
const ROLES=[
  ['piano',/(klavier|piano|begleitung)/i,/(piano|klavier)/i],
  ['violin',/(violin|violine|geige)/i,/(violin|violine|geige)/i],
  ['cello',/(cello|violoncello)/i,/(cello|violoncello)/i],
  ['viola',/(viola|bratsche)/i,/(viola|bratsche)/i],
  ['bass',/(bass|kontrabass)/i,/(bass|contrabass|kontrabass)/i],
  ['flute',/(flöte|floete|flute)/i,/(flute|flöte|floete)/i],
  ['clarinet',/(klarinette|clarinet)/i,/(clarinet|klarinette)/i]
];
function requestedRoles(text){return ROLES.filter(([,userRe])=>userRe.test(text)).map(([id])=>id)}
function roleForTrack(name){for(const [id,,trackRe] of ROLES)if(trackRe.test(String(name||'')))return id;return null}
function trackSignature(t){try{return JSON.stringify({nm:t?.nm||'',ch:t?.ch??null,pg:t?.pg??null,nt:t?.nt||[],ct:t?.ct||[]})}catch{return''}}
function selectForAssembly(text,all){
  const explicit=explicitSlots(text,all),roles=requestedRoles(text),active=activeSlot(),selected=[];
  const add=(src,tracks)=>{if(!src||!tracks?.length)return;selected.push({src,tracks})};
  if(explicit.length){
    for(const n of explicit){const src=all.find(x=>x.slot===n);if(!src)continue;let tr=src.score.tr||[];if(roles.length){const hit=tr.filter(t=>roles.includes(roleForTrack(t.nm)));if(hit.length)tr=hit}add(src,tr)}
    return selected;
  }
  if(roles.length){
    for(const role of roles){
      let candidates=all.map(src=>({src,tracks:(src.score.tr||[]).filter(t=>roleForTrack(t.nm)===role)})).filter(x=>x.tracks.length);
      if(!candidates.length)return[];
      const preferred=candidates.find(x=>x.src.slot===active)||candidates[candidates.length-1];add(preferred.src,preferred.tracks);
    }
    return selected;
  }
  const current=all.find(x=>x.slot===active);if(current)add(current,current.score.tr||[]);
  return selected;
}
function mergeSelection(selection,text){
  if(!selection.length)return null;
  let baseEntry=selection.find(x=>x.tracks.some(t=>roleForTrack(t.nm)==='piano'))||selection[0];
  const base=clone(baseEntry.src.score),wantedBase=new Set(baseEntry.tracks.map(trackSignature));
  base.tr=(base.tr||[]).filter(t=>wantedBase.has(trackSignature(t)));
  const seen=new Set(base.tr.map(trackSignature));
  for(const entry of selection){for(const t of entry.tracks){const sig=trackSignature(t);if(seen.has(sig))continue;base.tr.push(clone(t));seen.add(sig)}}
  if(!base.tr.length)return null;
  const srcNames=[...new Set(selection.map(x=>`Speicher ${x.src.slot}`))];
  base.ti=String(base.ti||'Gemeinsame Fassung').replace(/\.(mid|midi)$/i,'');
  if(selection.length>1&&!/gemeinsame fassung/i.test(base.ti))base.ti=`${base.ti} – gemeinsame Fassung`;
  base.sm=`Lokal zusammengeführt aus ${srcNames.join(' und ')}; vorhandene Noten wurden unverändert übernommen.`;
  return base;
}
function responseText(provider,d){
  if(provider==='anthropic')return(d?.content||[]).filter(x=>x?.type==='text').map(x=>x.text||'').join('\n');
  if(provider==='openai')return typeof d?.output_text==='string'?d.output_text:(d?.output||[]).flatMap(x=>x?.content||[]).map(x=>x?.text||'').join('\n');
  return(d?.candidates?.[0]?.content?.parts||[]).map(x=>x?.text||'').join('\n');
}
function replaceText(provider,d,text){
  const x=clone(d)||{};
  if(provider==='anthropic'){x.content=[{type:'text',text}];x.usage=x.usage||{input_tokens:0,output_tokens:0}}
  else if(provider==='openai'){x.output_text=text;x.output=[{type:'message',role:'assistant',content:[{type:'output_text',text}]}];x.usage=x.usage||{input_tokens:0,output_tokens:0,total_tokens:0}}
  else{x.candidates=[{content:{role:'model',parts:[{text}]}}];x.usageMetadata=x.usageMetadata||{promptTokenCount:0,candidatesTokenCount:0,totalTokenCount:0}}
  return x;
}
function synthetic(provider,text){
  let d={};
  if(provider==='anthropic')d={id:'mcl-local',type:'message',role:'assistant',content:[{type:'text',text}],model:'mcl-local',stop_reason:'end_turn',usage:{input_tokens:0,output_tokens:0}};
  else if(provider==='openai')d={id:'mcl-local',object:'response',status:'completed',output_text:text,output:[{type:'message',role:'assistant',content:[{type:'output_text',text}]}],usage:{input_tokens:0,output_tokens:0,total_tokens:0}};
  else d={candidates:[{content:{role:'model',parts:[{text}]},finishReason:'STOP'}],usageMetadata:{promptTokenCount:0,candidatesTokenCount:0,totalTokenCount:0}};
  return new Response(JSON.stringify(d),{status:200,headers:{'content-type':'application/json','x-mcl-local-op':'merge'}});
}
function sanitizeIncomplete(provider,d){
  const raw=responseText(provider,d);if(!raw.includes(ACTION_OPEN)||raw.includes(ACTION_CLOSE))return null;
  const prefix=raw.split(ACTION_OPEN)[0].trim();const text=`${prefix}${prefix?'\n\n':''}Die interne MIDI-Aktion wurde unvollständig übertragen und deshalb verworfen. Es wurde keine Datei verändert.`;
  return replaceText(provider,d,text);
}

window.fetch=async function(input,init={}){
  const url=typeof input==='string'?input:input?.url||'',provider=providerFor(url);
  if(!provider||typeof init.body!=='string')return innerFetch(input,init);
  let body;try{body=JSON.parse(init.body)}catch{return innerFetch(input,init)}
  const user=latestUser(provider,body),all=sources();
  if(user&&all.length&&pureAssembly(user)){
    const selection=selectForAssembly(user,all),score=mergeSelection(selection,user);
    if(score)return synthetic(provider,JSON.stringify(score));
  }
  const r=await innerFetch(input,init);if(!r.ok)return r;
  const d=await r.clone().json().catch(()=>null);if(!d)return r;
  const safe=sanitizeIncomplete(provider,d);if(!safe)return r;
  return new Response(JSON.stringify(safe),{status:r.status,headers:r.headers});
};
window.MCLSessionLocalOps={version:VERSION,pureAssembly,selectForAssembly,mergeSelection};
})();
