(()=>{
'use strict';
const stop=document.getElementById('mainMidiStop');
if(!stop)return;
function maxBeat(score){let max=0;(score?.tr||[]).forEach(t=>(t.nt||[]).forEach(n=>{if(!Array.isArray(n))return;const start=Number(n[0])||0,dur=Number(n[1])||0,gate=n.length>5?(Number(n[5])||.95):.95;max=Math.max(max,start+dur*Math.max(.05,gate))}));return max}
function fmt(sec){sec=Math.max(0,Math.floor(sec||0));return `${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}`}
stop.addEventListener('click',()=>{
  const seek=document.getElementById('mainMidiSeek');
  const time=document.getElementById('mainMidiTime');
  const status=document.getElementById('mainMidiStatus');
  if(seek)seek.value='0';
  const active=document.querySelector('.mcl-midi-slot.active');
  const slot=active?Number(active.dataset.slot)+1:0;
  const item=slot?window.MCLMidiSlots?.get?.([slot])?.[0]:null;
  if(time){const bpm=Math.max(20,Math.min(300,Number(item?.score?.bpm)||96));time.textContent=`0:00 / ${fmt(maxBeat(item?.score)*60/bpm)}`;}
  if(status)status.textContent='Gestoppt · Anfang.';
});
})();
