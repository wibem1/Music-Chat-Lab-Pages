(()=>{
'use strict';
if(window.__mclModelExtensionV2)return;window.__mclModelExtensionV2=true;
const FABLE={id:'claude-fable-5-1',label:'Claude Fable 5.1'};
const oldUpdate=window.updateModels,oldLabel=window.modelLabel;
if(typeof oldUpdate==='function')window.updateModels=function(preferred=null){oldUpdate(preferred);const p=document.getElementById('providerSelect'),m=document.getElementById('modelSelect');if(p?.value==='anthropic'&&m&&!m.querySelector(`option[value="${FABLE.id}"]`)){const o=document.createElement('option');o.value=FABLE.id;o.textContent=FABLE.label;m.insertBefore(o,m.firstChild)}if(preferred===FABLE.id&&m)m.value=FABLE.id};
if(typeof oldLabel==='function')window.modelLabel=function(provider,model){if(model===FABLE.id)return FABLE.label;return oldLabel(provider,model)};
function sync(){const p=document.getElementById('providerSelect'),m=document.getElementById('modelSelect');if(!p||!m)return;if(p.value==='anthropic'&&!m.querySelector(`option[value="${FABLE.id}"]`)){const o=document.createElement('option');o.value=FABLE.id;o.textContent=FABLE.label;m.insertBefore(o,m.firstChild)}try{const c=window.currentChat?.();if(c?.model===FABLE.id&&p.value==='anthropic')m.value=FABLE.id}catch{}}
sync();document.getElementById('providerSelect')?.addEventListener('change',()=>setTimeout(sync,0));
window.MCLModelsV2={fable:FABLE};
})();