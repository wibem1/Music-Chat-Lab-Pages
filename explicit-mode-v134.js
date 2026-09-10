(()=>{
'use strict';
if(window.__mclExplicitModeV134)return;
window.__mclExplicitModeV134=true;

const VERSION='1.3.12';
const nativeFetch=window.fetch.bind(window);
const CONCEPT_RE=/<MCL_CONCEPT>\s*([\s\S]*?)\s*<\/MCL_CONCEPT>/i;
let forwardingCompose=false;
window.MCLRequestMode='chat';

function setMode(mode){window.MCLRequestMode=mode==='compose'?'compose':'chat'}
function currentIdea(){return String(window.MCLCompositionIdea?.get?.()||document.getElementById('compositionIdeaInput')?.value||'').trim()}
function setIdea(text){const value=String(text||'').trim();if(!value)return;if(window.MCLCompositionIdea?.set)window.MCLCompositionIdea.set(value,{generated:true,source:'chat'});else{const e=document.getElementById('compositionIdeaInput');if(e)e.value=value}}

function removeLegacyProposalMarkers(){
  const key='music-chat-lab.chats.v1';
  try{
    const chats=JSON.parse(localStorage.getItem(key)||'[]');if(!Array.isArray(chats))return;let changed=false;
    for(const chat of chats){if(!Array.isArray(chat?.messages))continue;for(const message of chat.messages){if(typeof message?.text!=='string')continue;const cleaned=message.text.replace(/\n*\[MCL-(?:OPENAI-)?VORSCHLAG:[a-z0-9]+\]\s*/ig,'\n').replace(/\n{3,}/g,'\n\n').trim();if(cleaned!==message.text){message.text=cleaned;changed=true}}}
    if(changed)localStorage.setItem(key,JSON.stringify(chats));
  }catch(_){ }
}
function hasAssistantContext(){try{const chats=JSON.parse(localStorage.getItem('music-chat-lab.chats.v1')||'[]'),id=localStorage.getItem('music-chat-lab.active-chat.v1'),chat=Array.isArray(chats)?chats.find(c=>c?.id===id):null;return!!chat?.messages?.some(m=>m?.role==='assistant'&&!m?.isError&&!m?.thinking&&String(m?.text||'').trim())}catch{return false}}
function providerFor(url){const u=String(url||'');if(u.includes('api.anthropic.com/v1/messages'))return'anthropic';if(u.includes('api.openai.com/v1/responses'))return'openai';if(u.includes('generativelanguage.googleapis.com/')&&u.includes(':generateContent'))return'google';return null}

const OLD_HEAD='Die App interpretiert die Sprache des Nutzers nicht anhand von Schlüsselwörtern; du selbst entscheidest musikalisch und semantisch, was gemeint ist.';
const OLD_ACTION='MIDI-AKTIONEN: Antworte normal in natürlicher Sprache. Nur wenn jetzt tatsächlich eine MIDI-Fassung erzeugt oder verändert werden soll, hänge am Ende genau eine <MCL_ACTION> an. Die Entscheidung, welche Aktion passt, triffst du aus dem Gespräch heraus.';
const OLD_NO_ACTION='Gib keine MIDI-Aktion aus, wenn du nur diskutierst, analysierst oder einen Vorschlag machst.';
const OLD_CONTINUATION='GESPRÄCHSFORTSETZUNG: Wenn der Nutzer ein zuvor von dir angebotenes musikalisches Vorhaben bestätigt, verstehe die Bestätigung aus dem bisherigen Dialog. Es gibt keinen separaten DISCUSS/ANALYZE/COMPOSE-Router.';
function removeDecisionLayer(system){return String(system||'').replace(OLD_HEAD,'Der Ausführungsmodus dieses Zugs wurde vom Nutzer ausdrücklich gewählt.').replace(OLD_ACTION,'MIDI-AKTIONEN: Verwende die folgenden Aktionsformate für die technische Erzeugung oder Bearbeitung einer MIDI-Fassung.').replace(OLD_NO_ACTION,'').replace(OLD_CONTINUATION,'GESPRÄCHSFORTSETZUNG: Nutze den bisherigen Dialog vollständig als Kontext für den aktuellen, ausdrücklich gewählten Ausführungsmodus.')}

function directive(mode,idea){
  if(mode==='compose'){
    const brief=idea?`\n\nAKTUELLE KOMPOSITIONSIDEE AUS DEM EDITIERBAREN ARBEITSFELD:\n${idea}\nNutze diese Fassung als aktuelle musikalische Arbeitsanweisung. Der aktuelle Nutzertext kann sie ergänzen oder ausdrücklich verändern.`:'';
    return `AKTUELLER AUSFÜHRUNGSMODUS: KOMPONIERE.\nDieser Modus wurde ausdrücklich vom Nutzer gewählt. Der aktuelle Nutzertext ist im Zusammenhang mit dem bisherigen Dialog als verbindlicher Auftrag zur musikalischen Ausführung zu behandeln.${brief}\n\nErzeuge oder bearbeite die gewünschte MIDI-Fassung jetzt. Falls dafür vollständige Notendaten fehlen, fordere sie mit <MCL_NEED> an. Die endgültige Antwort dieses Zugs muss genau eine gültige <MCL_ACTION> enthalten. Gib nicht zuerst nur eine Kompositionsidee oder einen bloßen Vorschlag aus.\n\nKOMPOSITIONSIDEE ALS FESTES METADATUM: Jede ausgeführte Komposition oder Bearbeitung muss eine konkrete musikalische Kompositionsidee mitführen. Wenn das editierbare Arbeitsfeld eine Idee enthält, verwende deren aktuellen Inhalt als Ausgangspunkt. Wenn ohne vorhandene Idee direkt komponiert wird, entwickle die Kompositionsidee selbst während dieses Zugs, ohne Rückfrage und ohne zusätzliche Freigabestufe. Schreibe die resultierende aktuelle Idee bei NEW_SCORE in score.sm; bei PATCH, MERGE oder REPLACE_SCORE in action.summary bzw. zusätzlich in score.sm. Formuliere sie knapp: 2 bis 4 kurze Sätze, insgesamt höchstens etwa 350 Zeichen. Sie darf kein bloßer technischer Statussatz sein.`;
  }
  return `AKTUELLER AUSFÜHRUNGSMODUS: CHAT.\nDieser Modus wurde ausdrücklich vom Nutzer gewählt. In diesem Zug wird keine MIDI-Fassung erzeugt oder verändert und es darf keine <MCL_ACTION> ausgegeben werden. Antworte auf den eigentlichen Inhalt des Nutzertexts. Wenn der Nutzer im CHAT-Modus eine Komposition, Variation, Bearbeitung oder sonstige musikalische Ausführung verlangt, führe sie nicht als MIDI aus, sondern entwickle unmittelbar eine konkrete musikalische Kompositionsidee bzw. Bearbeitungsidee dafür. Triff die nötigen musikalischen Entscheidungen selbst und stelle keine vorbereitenden Rückfragen, außer der Nutzer bittet ausdrücklich darum. Halte eine solche Idee knapp: 2 bis 4 kurze Sätze, insgesamt höchstens etwa 350 Zeichen.\n\nEDITIERBARES IDEENFELD: Wenn deine Antwort tatsächlich eine konkrete, anschließend ausführbare Kompositions- oder Bearbeitungsidee formuliert oder eine solche Idee im Gespräch verändert, hänge ganz am Ende zusätzlich genau diesen verborgenen Block an: <MCL_CONCEPT>die aktuelle kurze Idee</MCL_CONCEPT>. Bei normaler Analyse, Kritik, Erklärung oder sonstigem Gespräch ohne neue bzw. geänderte ausführbare Idee darf kein <MCL_CONCEPT>-Block erscheinen.`;
}
function inject(system,mode,idea){return`${directive(mode,idea)}\n\n${removeDecisionLayer(system)}`}
function patchBody(provider,body,mode,idea){
  if(provider==='anthropic')body.system=inject(body.system,mode,idea);
  else if(provider==='openai'){const input=Array.isArray(body.input)?body.input:[],first=input.findIndex(x=>x?.role==='system');if(first>=0)input[first]={...input[first],content:inject(input[first].content,mode,idea)};else input.unshift({role:'system',content:directive(mode,idea)});body.input=input}
  else if(provider==='google'){const si=body.systemInstruction&&typeof body.systemInstruction==='object'?body.systemInstruction:{parts:[]},parts=Array.isArray(si.parts)?si.parts.slice():[];if(parts.length)parts[0]={...parts[0],text:inject(parts[0]?.text,mode,idea)};else parts.push({text:directive(mode,idea)});body.systemInstruction={...si,parts}}
  return body;
}
function responseText(provider,d){if(provider==='anthropic')return(d?.content||[]).filter(x=>x?.type==='text').map(x=>x.text||'').join('').trim();if(provider==='openai'){if(typeof d?.output_text==='string'&&d.output_text.trim())return d.output_text.trim();return(d?.output||[]).flatMap(x=>x?.content||[]).filter(x=>x?.type==='output_text'||x?.type==='text').map(x=>x?.text||'').join('\n').trim()}return(d?.candidates?.[0]?.content?.parts||[]).map(x=>x?.text||'').join('\n').trim()}
function replaceResponseText(provider,d,text){const x=JSON.parse(JSON.stringify(d||{}));if(provider==='anthropic')x.content=[{type:'text',text}];else if(provider==='openai'){x.output_text=text;x.output=[{type:'message',role:'assistant',content:[{type:'output_text',text}]}]}else{x.candidates=x.candidates?.length?x.candidates:[{}];x.candidates[0]={...(x.candidates[0]||{}),content:{role:'model',parts:[{text}]}}}return x}
function jsonResponse(data,r){const h=new Headers(r.headers||{});h.set('content-type','application/json');return new Response(JSON.stringify(data),{status:r.status,statusText:r.statusText,headers:h})}

window.fetch=async function(input,init={}){
  const url=typeof input==='string'?input:input?.url||'',provider=providerFor(url);if(!provider||typeof init.body!=='string')return nativeFetch(input,init);
  let body;try{body=JSON.parse(init.body)}catch{return nativeFetch(input,init)}
  const mode=window.MCLRequestMode==='compose'?'compose':'chat',idea=currentIdea();
  const response=await nativeFetch(input,{...init,body:JSON.stringify(patchBody(provider,body,mode,idea))});
  if(mode!=='chat'||!response.ok)return response;
  const d=await response.clone().json().catch(()=>null);if(!d)return response;const raw=responseText(provider,d),m=raw.match(CONCEPT_RE);if(!m)return response;
  setIdea(m[1]);const cleaned=raw.replace(CONCEPT_RE,'').replace(/\n{3,}/g,'\n\n').trim();return jsonResponse(replaceResponseText(provider,d,cleaned),response);
};

function bindButtons(){
  const chat=document.getElementById('sendButton'),compose=document.getElementById('composeButton'),input=document.getElementById('messageInput');if(!chat||!compose||!input)return;
  chat.addEventListener('click',()=>{if(!forwardingCompose)setMode('chat')},true);
  compose.addEventListener('click',()=>{
    if(chat.disabled)return;
    if(!input.value.trim()){
      if(currentIdea())input.value='Komponiere eine neue Fassung auf Grundlage der aktuellen Kompositionsidee.';
      else if(hasAssistantContext())input.value='Setze den zuletzt im Chat entwickelten Kompositionsvorschlag jetzt als MIDI um.';
      else{const note=document.getElementById('composerNote');if(note)note.textContent='Bitte zuerst einen Kompositionsauftrag eingeben oder eine Kompositionsidee formulieren.';return}
      input.dispatchEvent(new Event('input',{bubbles:true}));
    }
    setMode('compose');forwardingCompose=true;try{chat.click()}finally{forwardingCompose=false}
  });
  input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey)setMode('chat')},true);
  const syncDisabled=()=>{compose.disabled=chat.disabled};syncDisabled();new MutationObserver(syncDisabled).observe(chat,{attributes:true,attributeFilter:['disabled']});
}
removeLegacyProposalMarkers();bindButtons();window.MCLExplicitModeV134={version:VERSION,getMode:()=>window.MCLRequestMode,setMode};
})();
