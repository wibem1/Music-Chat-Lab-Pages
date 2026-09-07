(()=>{
'use strict';
const GM_INSTRUMENTS=["acoustic_grand_piano","bright_acoustic_piano","electric_grand_piano","honkytonk_piano","electric_piano_1","electric_piano_2","harpsichord","clavinet","celesta","glockenspiel","music_box","vibraphone","marimba","xylophone","tubular_bells","dulcimer","drawbar_organ","percussive_organ","rock_organ","church_organ","reed_organ","accordion","harmonica","tango_accordion","acoustic_guitar_nylon","acoustic_guitar_steel","electric_guitar_jazz","electric_guitar_clean","electric_guitar_muted","overdriven_guitar","distortion_guitar","guitar_harmonics","acoustic_bass","electric_bass_finger","electric_bass_pick","fretless_bass","slap_bass_1","slap_bass_2","synth_bass_1","synth_bass_2","violin","viola","cello","contrabass","tremolo_strings","pizzicato_strings","orchestral_harp","timpani","string_ensemble_1","string_ensemble_2","synth_strings_1","synth_strings_2","choir_aahs","voice_oohs","synth_choir","orchestra_hit","trumpet","trombone","tuba","muted_trumpet","french_horn","brass_section","synth_brass_1","synth_brass_2","soprano_sax","alto_sax","tenor_sax","baritone_sax","oboe","english_horn","bassoon","clarinet","piccolo","flute","recorder","pan_flute","blown_bottle","shakuhachi","whistle","ocarina","lead_1_square","lead_2_sawtooth","lead_3_calliope","lead_4_chiff","lead_5_charang","lead_6_voice","lead_7_fifths","lead_8_bass__lead","pad_1_new_age","pad_2_warm","pad_3_polysynth","pad_4_choir","pad_5_bowed","pad_6_metallic","pad_7_halo","pad_8_sweep","fx_1_rain","fx_2_soundtrack","fx_3_crystal","fx_4_atmosphere","fx_5_brightness","fx_6_goblins","fx_7_echoes","fx_8_scifi","sitar","banjo","shamisen","koto","kalimba","bag_pipe","fiddle","shanai","tinkle_bell","agogo","steel_drums","woodblock","taiko_drum","melodic_tom","synth_drum","reverse_cymbal","guitar_fret_noise","breath_noise","seashore","bird_tweet","telephone_ring","helicopter","applause","gunshot"];

const slots=new Array(6).fill(null);
let nextSlot=0,activeSlot=-1;
const loadingFiles=new Set(),seenGenerated=new Set();
const el=id=>document.getElementById(id);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const isMidi=f=>!!f&&(/\.midi?$/i.test(f.name)||/midi/i.test(f.type||''));
const fileKey=f=>`${f.name}|${f.size}|${f.lastModified}`;
const status=s=>{const x=el('mainMidiStatus');if(x)x.textContent=s};
function fmt(sec){sec=Math.max(0,Math.floor(sec||0));return `${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}`}
function scoreMaxBeat(score){let max=0;(score?.tr||[]).forEach(t=>(t.nt||[]).forEach(n=>{const start=Number(n[0])||0,dur=Number(n[1])||0,gate=n.length>5?(Number(n[5])||.95):.95;max=Math.max(max,start+dur*Math.max(.05,gate))}));return max}
function noteCount(score){return (score?.tr||[]).reduce((a,t)=>a+(t.nt?.length||0),0)}

// --- Tonwiedergabe: aus Composition Lab übernommen ---
let playerAudioCtx=null;
let playerMasterGain=null;
let playerInstrumentCache=new Map();
let playerPaused=false;
let playerPlaying=false;
let playerEndTimer=null;
let playerUiTimer=null;
let playerStartedAt=0;
let playerStartBeat=0;
let playerCurrentScore=null;

function gmProgramName(pg){pg=Math.max(0,Math.min(127,Number(pg)||0));return GM_INSTRUMENTS[pg]||"acoustic_grand_piano"}
function ensurePlayerAudio(){
  if(!playerAudioCtx){
    const AC=window.AudioContext||window.webkitAudioContext;
    if(!AC)throw new Error("Web Audio wird auf diesem Gerät nicht unterstützt.");
    playerAudioCtx=new AC();
    playerMasterGain=playerAudioCtx.createGain();
    playerMasterGain.gain.value=Number(el("mainMidiVolume")?.value||75)/100;
    playerMasterGain.connect(playerAudioCtx.destination);
  }
  return playerAudioCtx;
}
async function loadGMInstrument(program,channel){
  const key=channel===9?"drums":String(Math.max(0,Math.min(127,Number(program)||0)));
  if(playerInstrumentCache.has(key))return playerInstrumentCache.get(key);
  if(typeof Soundfont==="undefined")throw new Error("SoundFont-Modul konnte nicht geladen werden.");
  const name=channel===9?"synth_drum":gmProgramName(program);
  const promise=Soundfont.instrument(ensurePlayerAudio(),name,{soundfont:"FluidR3_GM",format:"mp3",destination:playerMasterGain});
  playerInstrumentCache.set(key,promise);
  try{return await promise}catch(err){
    playerInstrumentCache.delete(key);
    if(name!=="acoustic_grand_piano"){
      const fallback=Soundfont.instrument(ensurePlayerAudio(),"acoustic_grand_piano",{soundfont:"FluidR3_GM",format:"mp3",destination:playerMasterGain});
      playerInstrumentCache.set(key,fallback);
      return await fallback;
    }
    throw err;
  }
}
function stopGMPlayback(update=true){
  if(playerEndTimer){clearTimeout(playerEndTimer);playerEndTimer=null}
  if(playerUiTimer){clearInterval(playerUiTimer);playerUiTimer=null}
  playerInstrumentCache.forEach(p=>Promise.resolve(p).then(inst=>{try{inst.stop()}catch(_){}}).catch(()=>{}));
  playerPaused=false;playerPlaying=false;
  if(update)status("Gestoppt.");
}
async function playGMScore(score,fromBeat=0){
  if(!score||!Array.isArray(score.tr)||!score.tr.length){status("Noch keine Komposition zum Abspielen.");return}
  playerCurrentScore=score;
  const ac=ensurePlayerAudio();
  if(ac.state==="suspended")await ac.resume();
  stopGMPlayback(false);
  status("GM-Klänge werden geladen …");
  const used=[],seen=new Set();
  for(const t of score.tr){
    const ch=Math.max(0,Math.min(15,Number(t.ch)||0));
    const pg=Math.max(0,Math.min(127,Number(t.pg)||0));
    const key=ch===9?"drums":String(pg);
    if(!seen.has(key)){seen.add(key);used.push([pg,ch])}
  }
  await Promise.all(used.map(([pg,ch])=>loadGMInstrument(pg,ch)));
  const bpm=Math.max(20,Math.min(300,Number(score.bpm)||96));
  const secPerBeat=60/bpm;
  const base=ac.currentTime+.12;
  const startBeat=Math.max(0,Number(fromBeat)||0);
  for(const t of score.tr){
    const ch=Math.max(0,Math.min(15,Number(t.ch)||0));
    const pg=Math.max(0,Math.min(127,Number(t.pg)||0));
    const inst=await loadGMInstrument(pg,ch);
    for(const n of (t.nt||[])){
      const start=Math.max(0,Number(n[0])||0);
      const dur=Math.max(.02,Number(n[1])||.25);
      const gate=n.length>5?Math.max(.05,Math.min(4,Number(n[5])||.95)):.95;
      const end=start+dur*gate;
      if(end<=startBeat)continue;
      const pitch=Math.max(0,Math.min(127,Math.round(Number(n[2])||60)));
      const vel=Math.max(1,Math.min(127,Number(n[3])||80));
      const rel=Math.max(0,start-startBeat);
      try{
        inst.play(pitch,base+rel*secPerBeat,{duration:Math.max(.03,(end-Math.max(start,startBeat))*secPerBeat),gain:Math.max(.02,Math.min(1,vel/127))});
      }catch(err){console.warn("GM note playback failed",err)}
    }
  }
  playerPlaying=true;playerPaused=false;playerStartedAt=base;playerStartBeat=startBeat;
  status(`▶ Wiedergabe · FluidR3 GM · ${bpm} BPM`);
  const max=scoreMaxBeat(score);
  playerUiTimer=setInterval(()=>{
    if(!playerPlaying||playerPaused)return;
    const beat=Math.min(max,startBeat+Math.max(0,ac.currentTime-base)/secPerBeat);
    if(el('mainMidiSeek'))el('mainMidiSeek').value=String(max?Math.round(beat/max*1000):0);
    if(el('mainMidiTime'))el('mainMidiTime').textContent=`${fmt(beat*secPerBeat)} / ${fmt(max*secPerBeat)}`;
  },150);
  const totalMs=Math.max(250,((max-startBeat)*secPerBeat+.6)*1000);
  playerEndTimer=setTimeout(()=>{if(playerPlaying&&!playerPaused){stopGMPlayback(false);status("Wiedergabe beendet.")}},totalMs);
}
async function toggleGMPause(){
  if(!playerAudioCtx||!playerPlaying){status("Keine laufende Wiedergabe.");return}
  if(playerAudioCtx.state==="running"){
    await playerAudioCtx.suspend();playerPaused=true;
    if(playerEndTimer){clearTimeout(playerEndTimer);playerEndTimer=null}
    status("⏸ Pausiert.");
  }else{
    await playerAudioCtx.resume();playerPaused=false;status("▶ Wiedergabe fortgesetzt.");
  }
}

function updateSlots(){document.querySelectorAll('.mcl-midi-slot').forEach((b,i)=>{const filled=!!slots[i];b.classList.toggle('filled',filled);b.classList.toggle('active',i===activeSlot);b.textContent=filled?`${i+1} ✓`:`${i+1}`;b.title=filled?`Belegt: ${slots[i].name}`:`Speicherplatz ${i+1} · anklicken zum Belegen`})}
function selectSlot(i){if(!slots[i]){status(`Speicherplatz ${i+1} ist leer.`);return}stopGMPlayback(false);activeSlot=i;const item=slots[i],score=item.score,total=scoreMaxBeat(score)*60/(Number(score.bpm)||96);el('mainMidiTitle').textContent=`Speicher ${i+1}: ${item.name}`;el('mainMidiSeek').value='0';el('mainMidiTime').textContent=`0:00 / ${fmt(total)}`;status(`${item.name} bereit · ${noteCount(score)} Noten.`);updateSlots()}
function freeSlot(i){if(i<0||!slots[i])return;const wasActive=i===activeSlot;slots[i]=null;if(wasActive){stopGMPlayback(false);activeSlot=-1;el('mainMidiTitle').textContent='Noch kein Speicherplatz gewählt.';el('mainMidiSeek').value='0';el('mainMidiTime').textContent='0:00 / 0:00';status('Speicherplatz wurde freigegeben.')}updateSlots()}
function putScore(score,name,kind='MIDI',sourceKey=''){if(!score?.tr?.length)return;const sig=JSON.stringify(score);const existing=slots.findIndex(x=>x&&(sourceKey&&x.sourceKey===sourceKey||x.sig===sig));if(existing>=0){window.MCLTargetMidiSlot=null;selectSlot(existing);return}let requested=Number(window.MCLTargetMidiSlot),idx=Number.isInteger(requested)&&requested>=0&&requested<6&&!slots[requested]?requested:slots.findIndex(x=>!x);window.MCLTargetMidiSlot=null;if(idx<0){idx=nextSlot;nextSlot=(nextSlot+1)%6}else nextSlot=(idx+1)%6;slots[idx]={score,name:name||score.ti||kind,kind,sourceKey,sig};updateSlots();selectSlot(idx)}
function parsedToScore(parsed,name){const ppq=Number(parsed.ppq)||480,bpm=Number(parsed.tempos?.[0]?.bpm)||96,tr=[];(parsed.trackData||[]).forEach(t=>{const channels=[...new Set((t.notes||[]).map(n=>Number(n.channel)||1))];channels.forEach(ch1=>{const notes=(t.notes||[]).filter(n=>(Number(n.channel)||1)===ch1);if(!notes.length)return;const pe=(t.programs||[]).find(p=>Number(p.channel)===ch1);tr.push({nm:t.name||'Track',ch:clamp(ch1-1,0,15),pg:clamp((Number(pe?.program)||1)-1,0,127),nt:notes.map(n=>[Number(n.start)/ppq,Math.max(1,Number(n.duration))/ppq,Number(n.note),Number(n.velocity),0,1])})})});return{ti:name,bpm,tr}}
async function addFile(file){if(!isMidi(file))return;const key=fileKey(file);if(loadingFiles.has(key)||slots.some(x=>x?.sourceKey===key))return;loadingFiles.add(key);try{const parser=window.MusicFileProcessing?.parseMidi;if(!parser)throw new Error('MIDI-Parser nicht geladen.');putScore(parsedToScore(parser(await file.arrayBuffer()),file.name),file.name,'Import',key)}catch(e){status(`MIDI-Fehler: ${e.message||e}`)}finally{loadingFiles.delete(key)}}
function scoreFromText(text){let raw=String(text||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');const a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a>=0&&b>a)try{const x=JSON.parse(raw.slice(a,b+1));if(Array.isArray(x?.tr))return x}catch{}return null}
function getMessages(){try{const all=JSON.parse(localStorage.getItem('music-chat-lab.chats.v1'))||[],id=localStorage.getItem('music-chat-lab.active-chat.v1');return (all.find(c=>c.id===id)||{}).messages||[]}catch{return[]}}
function chatContainsImport(item){if(!item?.sourceKey)return false;const [name,size]=item.sourceKey.split('|');return getMessages().some(m=>m.role==='user'&&Array.isArray(m.files)&&m.files.some(f=>f.name===name&&String(f.size)===String(size)))}
function syncPending(files){const mids=Array.from(files||[]).filter(isMidi),keys=new Set(mids.map(fileKey));for(const f of mids)addFile(f);slots.forEach((item,i)=>{if(item?.kind==='Import'&&item.sourceKey&&!keys.has(item.sourceKey)&&!chatContainsImport(item))freeSlot(i)})}
function importGenerated(){for(const m of getMessages()){if(m.role!=='assistant'||m.isError||m.thinking)continue;const score=scoreFromText(m.text);if(!score)continue;const id=m.id||JSON.stringify(score);if(seenGenerated.has(id))continue;seenGenerated.add(id);putScore(score,score.ti||'KI-Komposition','KI',`ai:${id}`)}}
function slotSources(numbers){return (Array.isArray(numbers)?numbers:[]).map(n=>{const i=Number(n)-1,item=slots[i];return item?{slot:i+1,name:item.name,score:item.score,kind:item.kind}:null}).filter(Boolean)}
function allSlotSources(){return slots.map((item,i)=>item?{slot:i+1,name:item.name,score:item.score,kind:item.kind}:null).filter(Boolean)}
window.MCLMidiSlots={get:n=>slotSources(n),all:()=>allSlotSources(),has:n=>!!slots[Number(n)-1]};

document.querySelectorAll('.mcl-midi-slot').forEach((b,i)=>b.addEventListener('click',()=>{if(slots[i]){selectSlot(i);return}window.MCLTargetMidiSlot=i;status(`Speicherplatz ${i+1}: MIDI-Datei auswählen …`);el('fileInput')?.click()}));
el('mainMidiPlay')?.addEventListener('click',()=>{const item=slots[activeSlot];if(!item){status('Bitte zuerst einen belegten Speicherplatz wählen.');return}const max=scoreMaxBeat(item.score),from=max*(Number(el('mainMidiSeek')?.value)||0)/1000;playGMScore(item.score,from).catch(err=>status('Player-Fehler: '+err.message))});
el('mainMidiPause')?.addEventListener('click',()=>toggleGMPause().catch(err=>status('Player-Fehler: '+err.message)));
el('mainMidiStop')?.addEventListener('click',()=>{stopGMPlayback(true);if(el('mainMidiSeek'))el('mainMidiSeek').value='0'});
el('mainMidiSeek')?.addEventListener('change',()=>{const item=slots[activeSlot];if(!item)return;const max=scoreMaxBeat(item.score),from=max*(Number(el('mainMidiSeek').value)||0)/1000;playGMScore(item.score,from).catch(err=>status('Player-Fehler: '+err.message))});
el('mainMidiVolume')?.addEventListener('input',e=>{if(playerMasterGain)playerMasterGain.gain.value=Math.max(0,Math.min(1,Number(e.target.value)/100))});
window.addEventListener('mcl-pending-files-rendered',e=>syncPending(e.detail?.files||window.pendingFiles||[]));
new MutationObserver(importGenerated).observe(document.documentElement,{subtree:true,childList:true});
window.addEventListener('DOMContentLoaded',()=>{updateSlots();importGenerated();syncPending(window.pendingFiles||[])});
window.addEventListener('beforeunload',()=>stopGMPlayback(false));
})();