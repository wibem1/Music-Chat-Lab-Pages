(() => {
  'use strict';
  // v1.1.20 — compact-by-default context plus automatic fulfillment of explicit score-data requests.
  const CHAT_KEY='music-chat-lab.chats.v1';
  const ACTIVE_KEY='music-chat-lab.active-chat.v1';
  function allSlots(){
    try{return (window.MCLMidiSlots?.all?.()||[]).filter(x=>x&&x.score)}catch{return[]}
  }
  function scoreInfo(x){
    const s=x.score||{},tr=Array.isArray(s.tr)?s.tr:[],ts=s.ts||{};
    let notes=0,end=0;
    tr.forEach(t=>(t.nt||[]).forEach(n=>{if(!Array.isArray(n))return;notes++;end=Math.max(end,(Number(n[0])||0)+(Number(n[1])||0))}));
    const bar=(Number(ts.n)||4)*(4/(Number(ts.d)||4));
    return {slot:Number(x.slot),name:x.name||s.ti||`Stück ${x.slot}`,notes,bars:bar?Number((end/bar).toFixed(2)):null,bpm:s.bpm??null,meter:ts.n&&ts.d?`${ts.n}/${ts.d}`:null,key:s.k??null};
  }
  function catalogue(slots=allSlots()){
    if(!slots.length)return'';
    return slots.map(x=>{const i=scoreInfo(x);return `Speicherplatz ${i.slot}: ${i.name} | ${i.bars??'?'} Takte | ${i.bpm??'?'} BPM | ${i.meter??'?'} | Tonart ${i.key??'frei'} | ${i.notes} Noten`}).join('\n');
  }
  function scoreBlock(x){
    return `[MCL-ENGINE14-SCORE name=${JSON.stringify(`Speicherplatz ${x.slot}: ${x.name||x.score?.ti||`Stück ${x.slot}`}`)}]\n${JSON.stringify(x.score)}\n[/MCL-ENGINE14-SCORE]`;
  }
  function readJSON(key,fallback){try{return JSON.parse(localStorage.getItem(key)||'')||fallback}catch{return fallback}}
  function lastAssistantText(){
    try{
      const chats=readJSON(CHAT_KEY,[]),id=localStorage.getItem(ACTIVE_KEY),c=chats.find(x=>x.id===id)||chats[0];
      if(!c)return'';
      const m=[...(c.messages||[])].reverse().find(x=>x?.role==='assistant'&&!x.isError&&!x.thinking);
      return String(m?.text||'');
    }catch{return''}
  }
  function requestedSlotsFromLastAssistant(){
    const text=lastAssistantText();
    if(!text)return[];
    const asksForData=/(vollständ(?:ige|igen).*?(?:noten|notenmaterial|notendaten|partitur|score)|(?:noten|notendaten|partitur|score).*?(?:bereitstellen|anfordern|benötig|brauche|zugreifen)|speicherplatz.*?(?:bereitstellen|anfordern))/i.test(text);
    if(!asksForData)return[];
    const nums=[];
    for(const m of text.matchAll(/Speicherplatz\s*(\d+)/gi))nums.push(Number(m[1]));
    const ranges=[...text.matchAll(/Speicherplatz\s*(\d+)\s*(?:,|und|&|\/|bis)\s*(\d+)/gi)];
    for(const m of ranges){nums.push(Number(m[1]),Number(m[2]))}
    const valid=new Set(allSlots().map(x=>Number(x.slot)));
    return [...new Set(nums)].filter(n=>valid.has(n));
  }
  function fullWorkspace(numbers=null){
    let slots=allSlots();
    if(Array.isArray(numbers)&&numbers.length){const wanted=new Set(numbers.map(Number));slots=slots.filter(x=>wanted.has(Number(x.slot)))}
    if(!slots.length)return'';
    return `\n\n--- AUSGEWÄHLTES MUSIKMATERIAL ---\n${catalogue(slots)}\n\n${slots.map(scoreBlock).join('\n\n')}\n--- ENDE AUSGEWÄHLTES MUSIKMATERIAL ---`;
  }
  function compactWorkspace(){
    const slots=allSlots();if(!slots.length)return'';
    const requested=requestedSlotsFromLastAssistant();
    if(requested.length){
      return `\n\n--- AUTOMATISCH BEREITGESTELLTES MUSIKMATERIAL ---\nMusic Chat Lab hat die von der KI zuletzt ausdrücklich angeforderten vollständigen Notendaten der Speicherplätze ${requested.join(', ')} automatisch bereitgestellt. Verwende diese Daten jetzt direkt; fordere sie nicht erneut beim Nutzer an.\n${fullWorkspace(requested)}\n--- ENDE AUTOMATISCH BEREITGESTELLTES MUSIKMATERIAL ---`;
    }
    return `\n\n--- MUSIKALISCHER ARBEITSTISCH (KATALOG) ---\nDie folgenden MIDI-Speicherplätze sind belegt. Dies ist nur ein Katalog ohne Notendaten. Wenn für Analyse oder Komposition vollständige musikalische Daten nötig sind, kannst du sie im Gespräch ausdrücklich unter Nennung der Speicherplatznummern anfordern; Music Chat Lab stellt sie im nächsten Nutzerschritt automatisch bereit.\n\n${catalogue(slots)}\n--- ENDE MUSIKALISCHER ARBEITSTISCH (KATALOG) ---`;
  }
  window.MCLMidiWorkspaceContext=compactWorkspace;
  window.MCLMidiWorkspaceCatalogue=()=>catalogue(allSlots());
  window.MCLMidiWorkspaceSources=()=>allSlots().map(x=>({slot:Number(x.slot),name:x.name||x.score?.ti||`Stück ${x.slot}`,kind:x.kind,score:x.score}));
  window.MCLMidiSelectedContext=fullWorkspace;
  window.MCLMidiRequestedSlots=requestedSlotsFromLastAssistant;
})();
