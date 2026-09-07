(() => {
  // v1.0.11 — all occupied MIDI slots form the AI's musical workspace.
  // The model, not a phrase parser, decides which pieces the user's natural-language request refers to.
  function allSlots(){
    try{return (window.MCLMidiSlots?.all?.()||[]).filter(x=>x&&x.score)}catch{return[]}
  }
  function scoreInfo(x){
    const s=x.score||{},tr=Array.isArray(s.tr)?s.tr:[],ts=s.ts||{};
    let notes=0,end=0;
    tr.forEach(t=>(t.nt||[]).forEach(n=>{if(!Array.isArray(n))return;notes++;end=Math.max(end,(Number(n[0])||0)+(Number(n[1])||0))}));
    const bar=(Number(ts.n)||4)*(4/(Number(ts.d)||4));
    return {slot:x.slot,name:x.name||s.ti||`Stück ${x.slot}`,notes,bars:bar?Number((end/bar).toFixed(2)):null,bpm:s.bpm??null,meter:ts.n&&ts.d?`${ts.n}/${ts.d}`:null,key:s.k??null};
  }
  function workspace(){
    const slots=allSlots();if(!slots.length)return'';
    const catalog=slots.map(x=>{const i=scoreInfo(x);return `Speicherplatz ${i.slot}: ${i.name} | ${i.bars??'?'} Takte | ${i.bpm??'?'} BPM | ${i.meter??'?'} | Tonart ${i.key??'frei'} | ${i.notes} Noten`}).join('\n');
    const scores=slots.map(x=>`[MCL-ENGINE14-SCORE name=${JSON.stringify(`Speicherplatz ${x.slot}: ${x.name||x.score?.ti||`Stück ${x.slot}`}`)}]\n${JSON.stringify(x.score)}\n[/MCL-ENGINE14-SCORE]`).join('\n\n');
    return `\n\n--- MUSIKALISCHER ARBEITSTISCH ---\nDie folgenden belegten MIDI-Speicherplätze stehen dir als gemeinsamer musikalischer Kontext zur Verfügung. Interpretiere selbst aus dem natürlichen Auftrag und dem Gespräch, auf welche Stücke sich der Nutzer bezieht. Verwende nicht automatisch alle Stücke für eine Bearbeitung; entscheide anhand des Auftrags. Wenn die Referenz wirklich nicht eindeutig auflösbar ist, frage nach.\n\n${catalog}\n\n${scores}\n--- ENDE MUSIKALISCHER ARBEITSTISCH ---`;
  }
  window.MCLMidiWorkspaceContext=workspace;
})();