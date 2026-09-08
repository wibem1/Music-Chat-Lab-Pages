(()=>{
'use strict';
const VERSION='1.0.21';
const TABLET_BREAKPOINT=1180;
const sidebar=document.getElementById('sidebar');
const closeButton=document.getElementById('sidebarCloseButton');
const backdrop=document.getElementById('sidebarBackdrop');
const infoButton=document.getElementById('infoButton');
const infoDialog=document.getElementById('infoDialog');
const infoClose=document.getElementById('infoCloseButton');
function closeSidebar(){sidebar?.classList.remove('open');document.body.classList.remove('sidebar-open')}
function openSidebar(){sidebar?.classList.add('open');document.body.classList.add('sidebar-open')}
closeButton?.addEventListener('click',closeSidebar);
backdrop?.addEventListener('click',closeSidebar);
const menu=document.getElementById('menuButton');
menu?.addEventListener('click',()=>{requestAnimationFrame(()=>{sidebar?.classList.contains('open')?document.body.classList.add('sidebar-open'):document.body.classList.remove('sidebar-open')})});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeSidebar();if(infoDialog?.open)infoDialog.close()}});
window.addEventListener('resize',()=>{if(window.innerWidth>TABLET_BREAKPOINT)closeSidebar()});
infoButton?.addEventListener('click',()=>infoDialog?.showModal());
infoClose?.addEventListener('click',()=>infoDialog?.close());
infoDialog?.addEventListener('click',e=>{if(e.target===infoDialog)infoDialog.close()});
function scoreMaxBeat(score){let max=0;(score?.tr||[]).forEach(t=>(t.nt||[]).forEach(n=>{if(!Array.isArray(n))return;const start=Number(n[0])||0,dur=Number(n[1])||0,gate=n.length>5?(Number(n[5])||.95):.95;max=Math.max(max,start+dur*Math.max(.05,gate))}));return max}
function fmt(sec){sec=Math.max(0,Math.floor(sec||0));return `${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}`}
function rewindMidiUi(){
  const seek=document.getElementById('mainMidiSeek'),time=document.getElementById('mainMidiTime');
  if(seek)seek.value='0';
  if(!time)return;
  const active=document.querySelector('.mcl-midi-slot.active');
  const slot=active?Number(active.dataset.slot)+1:0;
  const item=slot?(window.MCLMidiSlots?.get?.([slot])||[])[0]:null;
  const score=item?.score;
  const bpm=Math.max(20,Math.min(300,Number(score?.bpm)||96));
  const total=score?scoreMaxBeat(score)*60/bpm:0;
  time.textContent=`0:00 / ${fmt(total)}`;
}
const stopButton=document.getElementById('mainMidiStop');
stopButton?.addEventListener('click',()=>{rewindMidiUi();requestAnimationFrame(rewindMidiUi)},true);
document.querySelectorAll('[data-app-version]').forEach(el=>el.textContent=`v${VERSION}`);
})();
