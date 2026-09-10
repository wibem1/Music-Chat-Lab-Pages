(()=>{
'use strict';
const VERSION='1.2.2';
const TABLET_BREAKPOINT=1180;
const sidebar=document.getElementById('sidebar');
const closeButton=document.getElementById('sidebarCloseButton');
const backdrop=document.getElementById('sidebarBackdrop');
const infoButton=document.getElementById('infoButton');
const infoDialog=document.getElementById('infoDialog');
const infoClose=document.getElementById('infoCloseButton');
function closeSidebar(){sidebar?.classList.remove('open');document.body.classList.remove('sidebar-open')}
closeButton?.addEventListener('click',closeSidebar);
backdrop?.addEventListener('click',closeSidebar);
const menu=document.getElementById('menuButton');
menu?.addEventListener('click',()=>{requestAnimationFrame(()=>{sidebar?.classList.contains('open')?document.body.classList.add('sidebar-open'):document.body.classList.remove('sidebar-open')})});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeSidebar();if(infoDialog?.open)infoDialog.close()}});
window.addEventListener('resize',()=>{if(window.innerWidth>TABLET_BREAKPOINT)closeSidebar()});
infoButton?.addEventListener('click',()=>{try{infoDialog?.showModal()}catch(_){infoDialog?.setAttribute('open','')}});
infoClose?.addEventListener('click',()=>{try{infoDialog?.close()}catch(_){infoDialog?.removeAttribute('open')}});
infoDialog?.addEventListener('click',e=>{if(e.target===infoDialog){try{infoDialog.close()}catch(_){infoDialog.removeAttribute('open')}}});
document.querySelectorAll('[data-app-version]').forEach(el=>el.textContent=`v${VERSION}`);
function normalizeApiKeyFields(){for(const id of ['anthropicKey','openaiKey','googleKey']){const el=document.getElementById(id);if(!el)continue;el.type='password';el.autocomplete='off';el.removeAttribute('name');el.removeAttribute('autocapitalize');el.removeAttribute('autocorrect');el.removeAttribute('spellcheck');el.removeAttribute('data-lpignore');el.removeAttribute('data-1p-ignore')}}
function fallbackWelcome(){const messages=document.getElementById('messages');if(!messages||messages.querySelector('.message-row,.welcome'))return;const w=document.createElement('div');w.className='welcome';w.innerHTML='<div class="welcome-logo">♪</div><h1>MusicChatLab</h1><p>Chatte mit Claude, Gemini und OpenAI und arbeite mit MIDI- und MusicXML-Dateien.</p>';messages.appendChild(w)}
function recoverChatShell(){const messages=document.getElementById('messages');if(!messages)return;if(messages.children.length===0){const list=document.getElementById('chatList'),n=document.getElementById('newChatButton');if(list&&n&&list.children.length===0){try{n.click()}catch(_){}}setTimeout(fallbackWelcome,80)}}
function bindClabToolbar(){if(document.getElementById('clabOpenBtn'))return true;const composer=document.querySelector('.composer'),box=document.querySelector('.composer-box');if(!composer||!box||!window.MCLCLAB)return false;const bar=document.createElement('div');bar.className='clab-toolbar';bar.style.cssText='max-width:820px;margin:6px auto;display:flex;gap:8px;align-items:center;flex-wrap:wrap';bar.innerHTML='<button type="button" class="secondary-button" id="clabOpenBtn">CLAB öffnen</button><button type="button" class="secondary-button" id="clabSaveBtn">CLAB speichern</button><span id="clabProjectBadge" style="font-size:12px;opacity:.75">CLAB</span><input id="clabFileInput" type="file" accept=".clab,application/json" hidden>';composer.insertBefore(bar,box);const input=document.getElementById('clabFileInput'),note=document.getElementById('composerNote');document.getElementById('clabOpenBtn').onclick=()=>{input.value='';input.click()};input.onchange=async()=>{const f=input.files?.[0];if(!f)return;try{window.MCLCLAB.applyDocument(JSON.parse(await f.text()),f.name)}catch(e){if(note)note.textContent='CLAB konnte nicht geöffnet werden: '+(e?.message||e)}};document.getElementById('clabSaveBtn').onclick=()=>{try{const d=window.MCLCLAB.makeDocument();const title=String(d.title||d.score?.ti||'Komposition').replace(/[\\/:*?"<>|]+/g,'_').trim()||'Komposition';const blob=new Blob([JSON.stringify(d,null,2)],{type:'application/json'}),u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=title+'.clab';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1500);if(note)note.textContent='CLAB gespeichert: '+title+'.'}catch(e){if(note)note.textContent=e?.message||String(e)}};return true}
function recoverClab(){if(bindClabToolbar())return;if(window.__mclClabRecoveryLoading)return;window.__mclClabRecoveryLoading=true;const s=document.createElement('script');s.src='clab-document-v1.js?v=1.2.1-recovery';s.onload=()=>{window.__mclClabRecoveryLoading=false;setTimeout(bindClabToolbar,20)};s.onerror=()=>{window.__mclClabRecoveryLoading=false;const n=document.getElementById('composerNote');if(n)n.textContent='CLAB-Modul konnte nicht geladen werden. Bitte die Seite neu laden.'};document.head.appendChild(s)}
function startRecovery(){normalizeApiKeyFields();recoverChatShell();recoverClab();setTimeout(normalizeApiKeyFields,120);setTimeout(recoverChatShell,250);setTimeout(recoverClab,300)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',startRecovery,{once:true});else startRecovery();
})();