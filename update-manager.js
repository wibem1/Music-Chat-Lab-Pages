(()=>{
'use strict';
if(!('serviceWorker' in navigator))return;
let reloading=false;
navigator.serviceWorker.addEventListener('controllerchange',()=>{
  if(reloading)return;
  reloading=true;
  location.reload();
});
window.addEventListener('load',async()=>{
  try{
    const reg=await navigator.serviceWorker.register('service-worker.js',{updateViaCache:'none'});
    await reg.update();
  }catch(e){console.warn('App-Aktualisierung konnte nicht geprüft werden',e)}
});
})();
