(()=>{
'use strict';
if(window.__mclDialogContinuationV1135)return;
window.__mclDialogContinuationV1135=true;

const innerFetch=window.fetch.bind(window);
const OFFER_MARK=/\[MCL-DIALOG-OFFER-ACCEPTED\]/;

function providerFor(url){
  const u=String(url||'');
  if(u.includes('api.openai.com/v1/responses'))return'openai';
  if(u.includes('api.anthropic.com/v1/messages'))return'anthropic';
  if(u.includes('generativelanguage.googleapis.com/')&&u.includes(':generateContent'))return'google';
  return null;
}
function textOf(m){
  if(typeof m?.content==='string')return m.content;
  if(Array.isArray(m?.content))return m.content.map(x=>x?.text||x?.input_text||x?.output_text||'').join('');
  if(Array.isArray(m?.parts))return m.parts.map(x=>x?.text||'').join('');
  return'';
}
function roleOf(provider,m){
  if(provider==='google')return m?.role==='model'?'assistant':'user';
  return m?.role==='assistant'?'assistant':'user';
}
function messageArray(provider,body){
  if(provider==='openai')return Array.isArray(body?.input)?body.input:[];
  if(provider==='anthropic')return Array.isArray(body?.messages)?body.messages:[];
  return Array.isArray(body?.contents)?body.contents:[];
}
function setText(provider,m,text,role){
  if(provider==='google')return{...m,role:role==='assistant'?'model':'user',parts:[{text}]};
  if(provider==='openai')return{...m,role,content:[{type:role==='assistant'?'output_text':'input_text',text}]};
  return{...m,role,content:text};
}
function makeMessage(provider,role,text){
  if(provider==='google')return{role:role==='assistant'?'model':'user',parts:[{text}]};
  if(provider==='openai')return{role,content:[{type:role==='assistant'?'output_text':'input_text',text}]};
  return{role,content:text};
}
function normalizedLead(text){
  return String(text||'').trim().toLowerCase().replace(/[.!?]+$/,'').trim();
}
function isShortAffirmative(text){
  const lead=normalizedLead(String(text||'').split(/\n--- |\n\[MCL-/,1)[0]);
  return /^(ja|ja bitte|ja, bitte|gern|gerne|okay|ok|mach das|mache das|bitte|los|genau|einverstanden|sehr gern|sehr gerne)$/.test(lead);
}
function isExplicitContinuation(text){
  const t=normalizedLead(String(text||'').split(/\n--- |\n\[MCL-/,1)[0]);
  const action=/(überarbeit|ueberarbeit|verbesser|ändere|aendere|variiere|variier|komponier|erstell|mach|setze|führe|fuehre)/.test(t);
  const music=/(melodie|melodiestimme|stimme|musik|stück|stueck|komposition|fassung|version|variation|begleitung|arrangement)/.test(t);
  const continuation=/(wie (?:von dir )?(?:vorgeschlagen|beschrieben|empfohlen)|wie besprochen|entsprechend (?:deinem|dem) vorschlag|so wie vorgeschlagen|jetzt wie)/.test(t);
  return action&&music&&(continuation||/^(überarbeit|ueberarbeit|verbesser|variiere|variier|komponier|erstell)/.test(t));
}
function isMusicalContext(text){
  const t=String(text||'').toLowerCase();
  if(/\[MCL-(?:OPENAI-)?VORSCHLAG:[a-z0-9]+\]/i.test(t))return false;
  if(/(?:claude|die ki) hat keine textantwort geliefert|laufende anfrage.*abgebrochen/.test(t))return false;
  const music=/(komponier|überarbeit|ueberarbeit|variation|variante|fassung|version|melodie|melodiestimme|stimme|begleitung|stück|stueck|komposition|arrangier|harmonisier|rhythm|phrasier|tonwahl|spannungsbogen)/.test(t);
  const action=/(erstell|komponier|überarbeit|ueberarbeit|variier|schreib|mach|entwickel|arrangier|harmonisier|verbesser)/.test(t);
  const offer=/(möchtest du|moechtest du|soll ich|kann ich|willst du|wenn du möchtest|wenn du willst|darf ich)[\s\S]{0,900}/.test(t);
  const plan=/(um .*?(?:zu erstellen|zu komponieren)|damit ich .*?(?:komponieren|erstellen|überarbeiten|ueberarbeiten) kann|eine .*?(?:melodie|stimme|fassung).*?(?:erstellen|komponieren|überarbeiten|ueberarbeiten))/.test(t);
  return music&&action&&(offer||plan);
}
function previousMusicalAssistant(provider,arr,lastUserIndex){
  let seen=0;
  for(let i=lastUserIndex-1;i>=0&&seen<10;i--){
    if(roleOf(provider,arr[i])!=='assistant')continue;
    seen++;
    const text=textOf(arr[i]);
    if(isMusicalContext(text))return{text,index:i};
  }
  return null;
}
function replaceLastUser(provider,body,text){
  const b=JSON.parse(JSON.stringify(body)),arr=messageArray(provider,b);
  for(let i=arr.length-1;i>=0;i--){
    if(roleOf(provider,arr[i])!=='user')continue;
    arr[i]=setText(provider,arr[i],text,'user');
    return b;
  }
  return b;
}
function proposalText(provider,data){
  if(provider==='anthropic')return(data?.content||[]).filter(x=>x?.type==='text').map(x=>x.text||'').join('').trim();
  if(provider==='openai'){
    if(typeof data?.output_text==='string'&&data.output_text.trim())return data.output_text.trim();
    return(data?.output||[]).flatMap(x=>x?.content||[]).map(x=>x?.text||'').join('\n').trim();
  }
  return(data?.candidates?.[0]?.content?.parts||[]).map(x=>x?.text||'').join('').trim();
}
function confirmationBody(provider,body,proposal){
  const b=JSON.parse(JSON.stringify(body)),arr=messageArray(provider,b);
  let last=-1;
  for(let i=arr.length-1;i>=0;i--)if(roleOf(provider,arr[i])==='user'){last=i;break}
  if(last<0)return b;
  arr.splice(last+1,0,makeMessage(provider,'assistant',proposal),makeMessage(provider,'user','ja'));
  return b;
}

window.fetch=async function(input,init={}){
  const url=typeof input==='string'?input:input?.url||'',provider=providerFor(url);
  if(!provider||typeof init.body!=='string')return innerFetch(input,init);
  let body;try{body=JSON.parse(init.body)}catch{return innerFetch(input,init)}
  const arr=messageArray(provider,body);let lastUser=-1;
  for(let i=arr.length-1;i>=0;i--)if(roleOf(provider,arr[i])==='user'){lastUser=i;break}
  if(lastUser<0)return innerFetch(input,init);
  const raw=textOf(arr[lastUser]);
  if(OFFER_MARK.test(raw))return innerFetch(input,init);
  const affirmative=isShortAffirmative(raw),explicit=isExplicitContinuation(raw);
  if(!affirmative&&!explicit)return innerFetch(input,init);
  const prev=previousMusicalAssistant(provider,arr,lastUser);
  if(!prev)return innerFetch(input,init);

  const tail=affirmative?raw.replace(/^\s*(?:ja\s*,?\s*bitte|ja|gern(?:e)?|okay|ok|mach(?:e)? das|bitte|los|genau|einverstanden|sehr gern(?:e)?)\s*[.!?]?\s*/i,''):raw;
  const expanded=`[MCL-DIALOG-OFFER-ACCEPTED]\nDies ist ausdrücklich ein konkreter KOMPOSITIONS-/BEARBEITUNGSAUFTRAG, kein allgemeines Gespräch und keine bloße Analyse. Der Nutzer möchte das zuvor beschriebene musikalische Vorhaben jetzt tatsächlich als neue MIDI-Fassung ausführen lassen. Wähle aus dem musikalischen Arbeitstisch nur die dafür nötigen Quellen. Bei einer Überarbeitung ist die aktuell ausgewählte Fassung die primäre Referenz, sofern sie das benötigte Material bereits vollständig enthält. Fordere keine Notendaten an, die im Arbeitstisch bereits vorhanden sind.\n\nMUSIKALISCHER KONTEXT DER KI:\n${String(prev.text||'').replace(/\[MCL-(?:OPENAI-)?VORSCHLAG:[^\]]+\]/ig,'').slice(-6000)}${tail?`\n\nAKTUELLER NUTZERAUFTRAG:\n${tail}`:''}`;
  const firstBody=replaceLastUser(provider,body,expanded);
  const first=await innerFetch(input,{...init,body:JSON.stringify(firstBody)});
  if(!first.ok)return first;
  let data;try{data=await first.clone().json()}catch{return first}
  const proposal=proposalText(provider,data);
  if(!/\[MCL-(?:OPENAI-)?VORSCHLAG:[a-z0-9]+\]/i.test(proposal))return first;

  const confirm=confirmationBody(provider,firstBody,proposal);
  return innerFetch(input,{...init,body:JSON.stringify(confirm)});
};
})();