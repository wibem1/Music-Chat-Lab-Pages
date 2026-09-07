const CACHE_NAME = "music-chat-lab-v1-0-7";
const APP_SHELL = ["./","./index.html","./styles.css?v=1.0.7","./app.js?v=1.0.7","./music-file-processing.js?v=1.0.7","./engine14-output.js?v=1.0.7","./concept-approval.js?v=1.0.7","./request-control.js?v=1.0.7","./chat-delete.js?v=1.0.7","./chat-titles.js?v=1.0.7","./android-download-fix.js?v=1.0.7","./midi-player.js?v=1.0.7","./midi-load-fix.js?v=1.0.7","./apk-playback-v11.js?v=1.0.7","./midi-memory.js?v=1.0.7","./midi-slot-delete.js?v=1.0.7","./update-manager.js?v=1.0.7","./manifest.webmanifest?v=1.0.7","./icon.svg?v=1.0.7"];
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