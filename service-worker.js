const CACHE_NAME = "music-chat-lab-v1-2-3";
const APP_SHELL = [
  "./","./index.html",
  "./styles.css?v=1.0.20","./ui-fixes.css?v=1.1.18","./app.js?v=1.2.3","./composition-state.js?v=1.2.1","./usage-costs.js?v=1.1.18",
  "./music-file-processing.js?v=1.0.20","./download-compat.js?v=1.0.20",
  "./api-usage.js?v=1.1.16","./composition-engine14.js?v=1.1.5","./composition-edit.js?v=1.2.0","./composition-controller.js?v=1.2.1",
  "./request-control.js?v=1.0.20","./midi-player.js?v=1.0.20","./midi-stop-reset.js?v=1.0.20",
  "./midi-slot-restore.js?v=1.0.20","./midi-input-sync.js?v=1.1.10",
  "./midi-playback-scheduler.js?v=1.0.22","./midi-context.js?v=1.1.20",
  "./clab-document-v1.js?v=1.1.3",
  "./chat-delete.js?v=1.0.20","./chat-titles.js?v=1.0.20",
  "./midi-memory.js?v=1.1.8","./midi-slot-delete.js?v=1.0.20",
  "./midi-export.js?v=1.0.20","./ui-enhancements.js?v=1.2.1","./diagnostic-enhancer.js?v=1.1.22","./backup-manager.js?v=1.2.2",
  "./manifest.webmanifest?v=1.0.20","./icon.svg?v=1.0.20"
];
self.addEventListener("install",event=>{event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(APP_SHELL)));self.skipWaiting();});
self.addEventListener("activate",event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE_NAME).map(key=>caches.delete(key)))));self.clients.claim();});
self.addEventListener("fetch",event=>{
  if(event.request.method!=="GET")return;
  if(event.request.mode==="navigate"){
    const fresh=new Request(event.request,{cache:"no-store"});
    event.respondWith(fetch(fresh).then(response=>{const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put("./index.html",copy));return response;}).catch(()=>caches.match("./index.html")||caches.match("./")));
    return;
  }
  event.respondWith(fetch(new Request(event.request,{cache:"no-store"})).then(response=>{const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put(event.request,copy));return response;}).catch(()=>caches.match(event.request)));
});