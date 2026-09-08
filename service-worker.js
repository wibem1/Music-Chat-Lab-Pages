const CACHE_NAME = "music-chat-lab-v1-0-21";
const APP_SHELL = [
  "./","./index.html",
  "./styles.css?v=1.0.20","./ui-fixes.css?v=1.0.20","./app.js?v=1.0.20",
  "./music-file-processing.js?v=1.0.20","./download-compat.js?v=1.0.20",
  "./composition-engine14.js?v=1.0.20","./concept-approval.js?v=1.0.20","./concept-openai.js?v=1.0.20",
  "./request-control.js?v=1.0.20","./midi-player.js?v=1.0.20","./midi-stop-reset.js?v=1.0.20",
  "./midi-slot-restore.js?v=1.0.20","./midi-input-sync.js?v=1.0.20",
  "./midi-playback-scheduler.js?v=1.0.20","./midi-context.js?v=1.0.20",
  "./clab-document-v1.js?v=1.0.20",
  "./chat-delete.js?v=1.0.20","./chat-titles.js?v=1.0.20",
  "./midi-memory.js?v=1.0.20","./midi-slot-delete.js?v=1.0.20",
  "./midi-export.js?v=1.0.20","./ui-enhancements.js?v=1.0.21",
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
