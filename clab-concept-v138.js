(()=>{
'use strict';
if(window.__mclClabConceptV138)return;
window.__mclClabConceptV138=true;

const el=id=>document.getElementById(id);
const clone=x=>x==null?x:JSON.parse(JSON.stringify(x));

function activeItem(){
  try{
    const b=document.querySelector('.mcl-midi-slot.active');
    if(!b||!window.MCLMidiSlots?.get)return null;
    const slot=Number(b.dataset.slot)+1;
    return window.MCLMidiSlots.get([slot])?.[0]||null;
  }catch{return null}
}

function concept(){
  const item=activeItem();
  const scoreConcept=String(item?.score?.sm||'').trim();
  if(scoreConcept)return scoreConcept;
  try{
    const doc=window.MCLCLAB?.getLoadedDocument?.();
    if(!doc)return'';
    const docConcept=String(doc.concept||doc.score?.sm||'').trim();
    if(!docConcept)return'';
    if(!item?.score)return docConcept;
    try{if(JSON.stringify(doc.score)===JSON.stringify(item.score))return docConcept}catch(_){ }
  }catch(_){ }
  return'';
}

function refresh(){
  const button=el('clabConceptBtn'),panel=el('clabConceptPanel');
  if(!button||!panel)return;
  const text=concept();
  button.disabled=!text;
  button.title=text?'Kompositionsidee des aktuell gewählten Stücks anzeigen':'Für dieses Stück ist noch keine Kompositionsidee gespeichert.';
  if(panel.hidden)return;
  panel.textContent=text||'Für dieses Stück ist noch keine Kompositionsidee gespeichert.';
}

function install(){
  const bar=document.querySelector('.clab-toolbar');
  if(!bar||el('clabConceptBtn'))return;
  const button=document.createElement('button');
  button.type='button';button.className='secondary-button';button.id='clabConceptBtn';button.textContent='Kompositionsidee';
  const panel=document.createElement('div');
  panel.id='clabConceptPanel';panel.hidden=true;
  panel.style.cssText='margin:4px 0 8px;padding:10px 12px;border:1px solid #d9dde1;border-radius:8px;background:#fff;color:#3f4b55;font-size:13px;line-height:1.45;white-space:pre-wrap;';
  const badge=el('clabProjectBadge');
  if(badge)bar.insertBefore(button,badge);else bar.appendChild(button);
  bar.insertAdjacentElement('afterend',panel);
  button.addEventListener('click',()=>{
    panel.hidden=!panel.hidden;
    button.setAttribute('aria-expanded',String(!panel.hidden));
    refresh();
  });
  refresh();
  const slots=el('midiSlots');if(slots)new MutationObserver(refresh).observe(slots,{subtree:true,attributes:true,attributeFilter:['class'],childList:true});
  new MutationObserver(refresh).observe(document.documentElement,{subtree:true,childList:true});
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{install();setTimeout(refresh,0)},{once:true});
else{install();setTimeout(refresh,0)}
window.MCLClabConceptV138={version:'1.3.8',getConcept:()=>concept(),refresh};
})();
