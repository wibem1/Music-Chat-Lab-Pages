(()=>{
'use strict';
const STORAGE_KEY='music-chat-lab.chats.v1';
const ACTIVE_KEY='music-chat-lab.active-chat.v1';
const list=document.getElementById('chatList');
if(!list)return;

function load(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY))||[]}catch{return[]}}
function cleanTitle(s){
  s=String(s||'').replace(/\[MCL-ENGINE14-SCORE[\s\S]*$/,'').replace(/--- DATEIANHÄNGE ---[\s\S]*$/,'').replace(/\s+/g,' ').trim();
  s=s.replace(/^(bitte\s+)?(kannst du\s+|kannst du bitte\s+|ich möchte\s+|ich will\s+|erstelle\s+|erzeuge\s+|komponiere\s+|mach(?:e)?\s+|analysiere\s+|vergleiche\s+)/i,'').trim();
  if(!s)return'';
  if(s.length<=52)return s;
  const cut=s.slice(0,52),i=cut.lastIndexOf(' ');
  return (i>30?cut.slice(0,i):cut).trim()+'…';
}
function suggested(chat){
  const u=(chat.messages||[]).find(m=>m.role==='user'&&!m.isError);
  if(u){
    const t=cleanTitle(u.displayText||u.text||'');
    if(t)return t;
    const f=u.files?.[0]?.name;
    if(f)return String(f).replace(/\.(mid|midi|musicxml|mxl|xml|json)$/i,'');
  }
  return 'Neuer Chat';
}
function setLiveTitle(id,title){
  try{
    if(typeof chats!=='undefined'&&Array.isArray(chats)){
      const c=chats.find(x=>x.id===id);
      if(c){c.title=title;c.updatedAt=Date.now();if(typeof saveChats==='function')saveChats();if(typeof renderAll==='function')renderAll();return true}
    }
  }catch(_){ }
  return false;
}
function persistTitle(id,title){
  if(setLiveTitle(id,title))return;
  const all=load(),c=all.find(x=>x.id===id);if(!c)return;
  c.title=title;c.updatedAt=Date.now();localStorage.setItem(STORAGE_KEY,JSON.stringify(all));
  location.reload();
}
function fillAutomaticTitles(){
  const all=load();let changed=false;
  for(const c of all){
    if((!c.title||c.title==='Neuer Chat')&&(c.messages||[]).some(m=>m.role==='user')){
      const t=suggested(c);if(t&&t!=='Neuer Chat'){c.title=t;changed=true;try{if(typeof chats!=='undefined'){const live=chats.find(x=>x.id===c.id);if(live)live.title=t}}catch(_){}}
    }
  }
  if(changed){localStorage.setItem(STORAGE_KEY,JSON.stringify(all));try{if(typeof saveChats==='function')saveChats()}catch(_){}}
}
function enhance(){
  fillAutomaticTitles();
  const all=[...load()].sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));
  [...list.children].forEach((item,i)=>{
    const chat=all[i];if(!chat)return;
    item.style.position='relative';item.style.paddingRight='68px';
    const titleEl=item.querySelector('.chat-item-title');
    if(titleEl&&titleEl.textContent!==chat.title)titleEl.textContent=chat.title||'Neuer Chat';
    if(item.querySelector('.chat-rename'))return;
    const edit=document.createElement('span');
    edit.className='chat-rename';edit.textContent='✎';edit.title='Chat umbenennen';edit.setAttribute('role','button');edit.setAttribute('aria-label','Chat umbenennen');
    Object.assign(edit.style,{position:'absolute',right:'36px',top:'50%',transform:'translateY(-50%)',width:'26px',height:'26px',display:'grid',placeItems:'center',borderRadius:'6px',fontSize:'17px',color:'#7b838b',cursor:'pointer'});
    edit.addEventListener('click',e=>{
      e.preventDefault();e.stopPropagation();
      const old=chat.title||suggested(chat)||'Neuer Chat';
      const value=prompt('Chatname',old);if(value===null)return;
      const name=String(value).replace(/\s+/g,' ').trim().slice(0,80);if(!name)return;
      persistTitle(chat.id,name);
    });
    item.appendChild(edit);
  });
  const active=localStorage.getItem(ACTIVE_KEY),chat=load().find(c=>c.id===active),head=document.getElementById('currentChatTitle');
  if(chat&&head)head.textContent=chat.title||'Neuer Chat';
}
new MutationObserver(()=>queueMicrotask(enhance)).observe(list,{childList:true,subtree:false});
const messages=document.getElementById('messages');if(messages)new MutationObserver(()=>queueMicrotask(enhance)).observe(messages,{childList:true});
enhance();
})();
