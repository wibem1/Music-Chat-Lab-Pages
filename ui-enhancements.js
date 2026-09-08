(()=>{
'use strict';
const VERSION='1.1.1';
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
document.querySelectorAll('[data-app-version]').forEach(el=>el.textContent=`v${VERSION}`);
})();