(()=>{
'use strict';
if(!window.Soundfont||typeof window.Soundfont.instrument!=='function')return;
const originalInstrument=window.Soundfont.instrument.bind(window.Soundfont);
window.Soundfont.instrument=async function(ac,name,options){
  const opts={...(options||{}),destination:ac.destination};
  const inst=await originalInstrument(ac,name,opts);
  if(!inst||typeof inst.play!=='function'||inst.__mclDirectRoute)return inst;
  const originalPlay=inst.play.bind(inst);
  inst.play=function(note,time,playOptions){
    const o={...(playOptions||{})};
    const vol=Math.max(0,Math.min(1,(Number(document.getElementById('mainMidiVolume')?.value)||75)/100));
    if(Number.isFinite(Number(o.gain)))o.gain=Math.max(0,Math.min(1,Number(o.gain)*vol));
    else o.gain=vol;
    return originalPlay(note,time,o);
  };
  inst.__mclDirectRoute=true;
  return inst;
};
})();