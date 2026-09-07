const CACHE_NAME = "music-chat-lab-v0-4-25";
const APP_SHELL = [
  "./styles.css?v=0.4.25",
  "./app.js?v=0.4.25",
  "./music-file-processing.js?v=0.4.25",
  "./engine14-output.js?v=0.4.25",
  "./concept-approval.js?v=0.4.25",
  "./request-control.js?v=0.4.25",
  "./chat-delete.js?v=0.4.25",
  "./android-download-fix.js?v=0.4.25",
  "./midi-player.js?v=0.4.25",
  "./manifest.webmanifest?v=0.4.25",
  "./icon.svg?v=0.4.25"
];
self.addEventListener("install",event=>{event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(APP_SHELL)));self.skipWaiting();});
self.addEventListener("activate",event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE_NAME).map(key=>caches.delete(key)))));self.clients.claim();});
self.addEventListener("fetch",event=>{if(event.request.method!=="GET")return;if(event.request.mode==="navigate"){event.respondWith(fetch(event.request).catch(()=>caches.match("./index.html")||caches.match("./")));return;}event.respondWith(fetch(event.request).then(response=>{const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put(event.request,copy));return response;}).catch(()=>caches.match(event.request)));});