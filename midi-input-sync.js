(()=>{
'use strict';
const input=document.getElementById('fileInput');
if(!input)return;
const isMidi=f=>!!f&&(/\.midi?$/i.test(f.name)||/midi/i.test(f.type||''));
const key=f=>`${f.name}|${f.size}|${f.lastModified}`;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function parsedToScore(parsed,name){
  const ppq=Number(parsed?.ppq)||480,bpm=Number(parsed?.tempos?.[0]?.bpm)||96,tr=[];
  (parsed?.trackData||[]).forEach(t=>{
    const channels=[...new Set((t.notes||[]).map(n=>Number(n.channel)||1))];
    channels.forEach(ch1=>{
      const notes=(t.notes||[]).filter(n=>(Number(n.channel)||1)===ch1);if(!notes.length)return;
      const pe=(t.programs||[]).find(p=>Number(p.channel)===ch1);
      tr.push({nm:t.name||'Track',ch:clamp(ch1-1,0,15),pg:clamp((Number(pe?.program)||1)-1,0,127),nt:notes.map(n=>[Number(n.start)/ppq,Math.max(1,Number(n.duration))/ppq,Number(n.note),Number(n.velocity),0,1])});
    });
  });
  return{ti:String(name||'Importierte MIDI-Datei').replace(/\.midi?$/i,''),bpm,tr};
}
async function loadIntoChosenSlot(file,slotIndex){
  const api=window.MCLMidiSlots,parser=window.MusicFileProcessing?.parseMidi;
  if(!api?.all||!api?.restoreState||!parser)throw new Error('MIDI-Arbeitstisch ist noch nicht bereit.');
  const score=parsedToScore(parser(await file.arrayBuffer()),file.name);
  if(!score.tr.length)throw new Error('Die MIDI-Datei enthält keine spielbaren Noten.');
  const items=api.all().map(x=>({slot:x.slot,name:x.name,kind:x.kind,score:x.score}));
  const slot=slotIndex+1;
  const pos=items.findIndex(x=>Number(x.slot)===slot);
  const item={slot,name:file.name,kind:'Import',score};
  if(pos>=0)items[pos]=item;else items.push(item);
  api.restoreState(items,slot);
}
input.addEventListener('change',e=>{
  const selected=Array.from(e.target.files||[]).filter(isMidi);
  if(!selected.length)return;
  const slotTarget=Number(window.MCLTargetMidiSlot);
  const isSlotLoad=Number.isInteger(slotTarget)&&slotTarget>=0&&slotTarget<6;
  if(isSlotLoad){
    e.stopImmediatePropagation();
    const file=selected[0];
    window.MCLTargetMidiSlot=null;
    queueMicrotask(async()=>{
      try{await loadIntoChosenSlot(file,slotTarget)}
      catch(err){const s=document.getElementById('mainMidiStatus');if(s)s.textContent='MIDI-Fehler: '+(err?.message||err)}
      finally{input.value=''}
    });
    return;
  }
  const combined=[],seen=new Set();
  for(const f of [...(window.pendingFiles||[]),...selected]){
    if(!isMidi(f))continue;
    const k=key(f);if(seen.has(k))continue;seen.add(k);combined.push(f);
  }
  queueMicrotask(()=>window.dispatchEvent(new CustomEvent('mcl-pending-files-rendered',{detail:{files:combined,source:'direct-file-input'}})));
},true);
})();
