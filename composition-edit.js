(()=>{
'use strict';
if(window.MCLCompositionEditV122)return;
window.MCLCompositionEditV122=true;

const clone=x=>x==null?x:JSON.parse(JSON.stringify(x));

const conceptGuide=`Beginne den Kompositionsvorschlag zwingend mit „Auftrag verstanden:“ und gib den Auftrag in einem kurzen Satz in eigenen Worten wieder. Nenne dabei ausdrücklich, was erzeugt oder verändert werden soll und – sofern der Nutzer etwas unverändert lassen will – was unverändert bleiben soll.
Formuliere danach einen kurzen musikalischen Gedanken/Impuls in höchstens drei kurzen Sätzen. Beschreibe nur die wesentliche kompositorische Idee, keinen detaillierten Ablauf oder technischen Bauplan. Nenne Tempo in BPM. Nenne eine Taktzahl nur, wenn Taktart und Umfang aus den vorhandenen Daten eindeutig hervorgehen; sonst beschreibe den Umfang relativ zum Ausgangsmaterial.`;

const protocol=`BEARBEITUNGS- UND AUSGABESTRATEGIE:
- Entscheide aus dem freien Nutzerauftrag selbst, ob eine vollständige Partitur oder nur eine Änderung an vorhandenem Material nötig ist.
- Wenn vorhandenes Material nur ergänzt oder teilweise verändert werden soll, gib bevorzugt ein PATCH-JSON aus. Ungeänderte Teile werden von der App exakt aus dem Ausgangsmaterial übernommen.
- Wenn alles neu entstehen soll oder eine grundlegende Umgestaltung die ganze Partitur betrifft, gib eine vollständige Partitur im normalen Format aus.
- Diese Entscheidung ist rein technisch; ändere keine musikalische Vorgabe des Nutzers.

PATCH-FORMAT:
{
  "mode":"patch",
  "base":1,
  "ti":"Neuer Titel",
  "sm":"Kurze Zusammenfassung",
  "meta":{"bpm":74,"ts":{"n":4,"d":4},"k":"C major"},
  "ops":[
    {"op":"add_track","track":{"nm":"Violine","ch":1,"pg":40,"nt":[...],"ct":[...]}},
    {"op":"insert_track","index":0,"track":{...}},
    {"op":"replace_track","index":0,"track":{...}},
    {"op":"delete_track","index":0},
    {"op":"replace_range","index":0,"start":16,"end":32,"nt":[...],"ct":[...]}
  ]
}
- "base" ist die Nummer des vorhandenen Materials, beginnend bei 1.
- Track-"index" beginnt bei 0. Alternativ darf bei replace_track, delete_track und replace_range ein eindeutiger exakter Trackname als "name" verwendet werden.
- Bei replace_range sind start und end globale Beat-Positionen; nur Ereignisse mit Startposition im Bereich [start,end) werden ersetzt.
- "meta" ist optional. Nicht genannte Metadaten bleiben unverändert.
- Nicht genannte Tracks und Bereiche bleiben unverändert.
- Für neue Musik ohne zu erhaltendes Ausgangsmaterial verwende die vollständige Partitur.
- Antworte ausschließlich mit genau einem validen JSON-Objekt, ohne Markdown oder Kommentar.`;

function parseObject(text){
  let s=String(text||'').trim();
  const f=s.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if(f)s=f[1].trim();
  const a=s.indexOf('{'),b=s.lastIndexOf('}');
  if(a<0||b<=a)return null;
  try{return JSON.parse(s.slice(a,b+1))}catch{return null}
}

function trackIndex(score,op){
  if(Number.isInteger(op?.index))return op.index;
  if(typeof op?.name==='string'){
    const hits=(score.tr||[]).map((t,i)=>t?.nm===op.name?i:-1).filter(i=>i>=0);
    if(hits.length===1)return hits[0];
  }
  return -1;
}
function validTrack(t){return !!t&&typeof t==='object'&&Array.isArray(t.nt)}
function sortEvents(a){return (a||[]).slice().sort((x,y)=>(Number(x?.[0])||0)-(Number(y?.[0])||0))}
function applyPatch(patch,sources){
  if(!patch||patch.mode!=='patch'||!Array.isArray(patch.ops))return null;
  const base=Math.max(1,Math.trunc(Number(patch.base)||1))-1;
  const src=sources?.[base]?.score;
  if(!src||!Array.isArray(src.tr))return null;
  const score=clone(src);
  if(typeof patch.ti==='string'&&patch.ti.trim())score.ti=patch.ti.trim();
  if(typeof patch.sm==='string')score.sm=patch.sm;
  if(patch.meta&&typeof patch.meta==='object'){
    for(const key of ['bpm','ts','k'])if(Object.prototype.hasOwnProperty.call(patch.meta,key))score[key]=clone(patch.meta[key]);
  }
  for(const op of patch.ops){
    if(!op||typeof op.op!=='string')return null;
    if(op.op==='add_track'){
      if(!validTrack(op.track))return null;
      score.tr.push(clone(op.track));
      continue;
    }
    if(op.op==='insert_track'){
      if(!validTrack(op.track))return null;
      const at=Math.max(0,Math.min(score.tr.length,Math.trunc(Number(op.index)||0)));
      score.tr.splice(at,0,clone(op.track));
      continue;
    }
    const ix=trackIndex(score,op);
    if(ix<0||ix>=score.tr.length)return null;
    if(op.op==='replace_track'){
      if(!validTrack(op.track))return null;
      score.tr[ix]=clone(op.track);
      continue;
    }
    if(op.op==='delete_track'){
      score.tr.splice(ix,1);
      continue;
    }
    if(op.op==='replace_range'){
      const start=Number(op.start),end=Number(op.end);
      if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||!Array.isArray(op.nt))return null;
      const tr=clone(score.tr[ix]);
      tr.nt=sortEvents((tr.nt||[]).filter(n=>{const t=Number(n?.[0]);return !(Number.isFinite(t)&&t>=start&&t<end)}).concat(clone(op.nt)));
      if(Array.isArray(op.ct)){
        tr.ct=sortEvents((tr.ct||[]).filter(c=>{const t=Number(c?.[0]);return !(Number.isFinite(t)&&t>=start&&t<end)}).concat(clone(op.ct)));
      }
      score.tr[ix]=tr;
      continue;
    }
    return null;
  }
  if(!score.ti||!String(score.ti).trim())score.ti='Neue Komposition';
  return score;
}
function materialize(text,sources){
  const x=parseObject(text);
  if(!x)return null;
  if(Array.isArray(x.tr)&&x.tr.some(t=>Array.isArray(t?.nt)))return x;
  if(x.mode==='patch')return applyPatch(x,sources||[]);
  return null;
}
window.MCLCompositionEdit={
  conceptGuide,
  protocol,
  materialize,
  parseObject
};
})();