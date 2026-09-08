(() => {
  'use strict';
  // v1.1.11 — compact-by-default musical context.
  // Normal conversation receives only a small catalogue. Full note data is exposed
  // separately so semantic routing can attach only the actually needed scores.
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
  function compactWorkspace(){
    const slots=allSlots();if(!slots.length)return'';
    return `\n\n--- MUSIKALISCHER ARBEITSTISCH (KATALOG) ---\nDie folgenden MIDI-Speicherplätze sind belegt. Dies ist nur ein Katalog ohne Notendaten. Wenn für Analyse oder Komposition vollständige musikalische Daten nötig sind, werden sie von Music Chat Lab gezielt separat bereitgestellt.\n\n${catalogue(slots)}\n--- ENDE MUSIKALISCHER ARBEITSTISCH (KATALOG) ---`;
  }
  function fullWorkspace(numbers=null){
    let slots=allSlots();
    if(Array.isArray(numbers)&&numbers.length){const wanted=new Set(numbers.map(Number));slots=slots.filter(x=>wanted.has(Number(x.slot)))}
    if(!slots.length)return'';
    return `\n\n--- AUSGEWÄHLTES MUSIKMATERIAL ---\n${catalogue(slots)}\n\n${slots.map(scoreBlock).join('\n\n')}\n--- ENDE AUSGEWÄHLTES MUSIKMATERIAL ---`;
  }
  window.MCLMidiWorkspaceContext=compactWorkspace;
  window.MCLMidiWorkspaceCatalogue=()=>catalogue(allSlots());
  window.MCLMidiWorkspaceSources=()=>allSlots().map(x=>({slot:Number(x.slot),name:x.name||x.score?.ti||`Stück ${x.slot}`,kind:x.kind,score:x.score}));
  window.MCLMidiSelectedContext=fullWorkspace;
})();
