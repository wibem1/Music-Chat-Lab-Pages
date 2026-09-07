(()=>{
'use strict';
function byId(id){return document.getElementById(id)}
function setStatus(text){const s=byId('mainMidiStatus');if(s)s.textContent=text}
async function runAudioDiagnostic(){
  const AC=window.AudioContext||window.webkitAudioContext;
  if(!AC){setStatus('Audio-Test: Web Audio API nicht verfügbar.');return}
  const ac=new AC();
  try{if(ac.state==='suspended')await ac.resume()}catch(e){setStatus('Audio-Test: AudioContext konnte nicht gestartet werden · '+(e?.message||e));return}
  setStatus('Audio-Test 1/2: Sinuston 880 Hz …');
  try{
    const g=ac.createGain();g.gain.value=.25;g.connect(ac.destination);
    const o=ac.createOscillator();o.type='sine';o.frequency.value=880;o.connect(g);
    o.start(ac.currentTime+.03);o.stop(ac.currentTime+.45);
  }catch(e){setStatus('Audio-Test 1 FEHLER · '+(e?.message||e));return}
  await new Promise(r=>setTimeout(r,700));
  if(typeof window.Soundfont==='undefined'){setStatus('Audio-Test: Sinuston beendet · SoundFont-Modul fehlt.');return}
  setStatus('Audio-Test 2/2: SoundFont-Piano C4 wird geladen …');
  try{
    const inst=await window.Soundfont.instrument(ac,'acoustic_grand_piano',{soundfont:'FluidR3_GM',format:'mp3',destination:ac.destination});
    const count=inst?.buffers?Object.keys(inst.buffers).length:'?';
    setStatus(`Audio-Test 2/2: Piano geladen · Samples ${count} · C4 wird gespielt …`);
    inst.play(60,ac.currentTime+.05,{duration:.8,gain:.8});
    setTimeout(()=>setStatus(`Audio-Test beendet · Samples ${count} · Bitte melden: Sinuston gehört? Pianoton gehört?`),1200);
  }catch(e){setStatus('Audio-Test 2 FEHLER · '+(e?.message||e))}
}
window.addEventListener('DOMContentLoaded',()=>{
  const player=byId('mainMidiPlayer');if(!player||byId('mainMidiAudioTest'))return;
  const b=document.createElement('button');b.type='button';b.id='mainMidiAudioTest';b.textContent='🔔 Testton';b.title='Audio-Ausgabe und SoundFont getrennt prüfen';b.addEventListener('click',()=>runAudioDiagnostic().catch(e=>setStatus('Audio-Test FEHLER · '+(e?.message||e))));
  const stop=byId('mainMidiStop');if(stop)stop.insertAdjacentElement('afterend',b);else player.appendChild(b);
});
})();