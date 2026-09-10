(()=>{
'use strict';
if(window.__mclDialogContinuationV1134)return;
window.__mclDialogContinuationV1134=true;

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
function isMusicalOffer(text){
  const t=String(text||'').toLowerCase();
  const asks=/(möchtest du|soll ich|kann ich|willst du|wenn du möchtest|wenn du willst|darf ich)[\s\S]{0,500}[?]/.test(t)||/möchtest du[\s\S]{0,800}(erstell|komponier|überarbeit|variier)/.test(t);
  const music=/(komponier|überarbeit|variation|variante|fassung|version|melodie|melodiestimme|stimme|begleitung|stück|komposition|arrangier|harmonisier)/.test(t);
  const action=/(erstell|komponier|überarbeit|variier|schreib|mach|entwickel|arrangier|harmonisier)/.test(t);
  return asks&&music&&action;
}
function previousAssistant(provider,arr,lastUserIndex){
  for(let i=lastUserIndex-1;i>=0;i--)if(roleOf(provider,arr[i])==='assistant')return{text:textOf(arr[i]),index:i};
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
  if(OFFER_MARK.test(raw)||!isShortAffirmative(raw))return innerFetch(input,init);
  const prev=previousAssistant(provider,arr,lastUser);
  if(!prev||!isMusicalOffer(prev.text)||/\[MCL-(?:OPENAI-)?VORSCHLAG:[a-z0-9]+\]/i.test(prev.text))return innerFetch(input,init);

  const tail=raw.replace(/^\s*(?:ja\s*,?\s*bitte|ja|gern(?:e)?|okay|ok|mach(?:e)? das|bitte|los|genau|einverstanden|sehr gern(?:e)?)\s*[.!?]?\s*/i,'');
  const expanded=`[MCL-DIALOG-OFFER-ACCEPTED]\nDer Nutzer bestätigt das unmittelbar vorherige Angebot, Musik zu erzeugen oder musikalisch zu überarbeiten. Führe dieses angebotene Vorhaben jetzt als Kompositionsauftrag aus. Nutze die dafür tatsächlich benötigten Quellen aus dem musikalischen Arbeitstisch; die aktuell ausgewählte Fassung ist bei einem Überarbeitungsangebot die primäre Referenz.\n\nANGENOMMENES ANGEBOT DER KI:\n${String(prev.text||'').replace(/\[MCL-(?:OPENAI-)?VORSCHLAG:[^\]]+\]/ig,'').slice(-5000)}${tail?`\n\nZUSÄTZLICHER NUTZERKONTEXT:\n${tail}`:''}`;
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