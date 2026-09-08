(()=>{
'use strict';
function clickDownload(url,name){const a=document.createElement('a');a.href=url;a.download=name||'download';a.rel='noopener';document.body.appendChild(a);a.click();a.remove()}
window.MCLDownloadBlob=function(blob,name){const url=URL.createObjectURL(blob);try{clickDownload(url,name)}finally{setTimeout(()=>URL.revokeObjectURL(url),3000)}};
window.MCLDownloadText=function(text,name,type='text/plain;charset=utf-8'){window.MCLDownloadBlob(new Blob([text],{type}),name)};
window.MCLDownloadJSON=function(data,name){window.MCLDownloadText(JSON.stringify(data,null,2),name,'application/json;charset=utf-8')};
window.MCLDownloadDiagnostic=function(){const data={createdAt:new Date().toISOString(),userAgent:navigator.userAgent,location:String(location.href),online:navigator.onLine,serviceWorker:'serviceWorker'in navigator,cacheKeys:[],localStorageKeys:Object.keys(localStorage)};if('caches'in window)caches.keys().then(k=>{data.cacheKeys=k;window.MCLDownloadJSON(data,`Music-Chat-Lab-Diagnose-${new Date().toISOString().replace(/[:.]/g,'-')}.json`)});else window.MCLDownloadJSON(data,`Music-Chat-Lab-Diagnose-${new Date().toISOString().replace(/[:.]/g,'-')}.json`)};
})();
