(()=>{
  const STORAGE_KEY='music-chat-lab.chats.v1';
  const ACTIVE_KEY='music-chat-lab.active-chat.v1';
  const list=document.getElementById('chatList');
  if(!list)return;
  function load(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY))||[]}catch{return[]}}
  function enhance(){
    const chats=[...load()].sort((a,b)=>b.updatedAt-a.updatedAt);
    [...list.children].forEach((item,i)=>{
      if(item.querySelector('.chat-delete'))return;
      const chat=chats[i];if(!chat)return;
      item.style.position='relative';item.style.paddingRight='38px';
      const del=document.createElement('span');
      del.className='chat-delete';del.textContent='×';del.title='Chat löschen';del.setAttribute('role','button');del.setAttribute('aria-label','Chat löschen');
      Object.assign(del.style,{position:'absolute',right:'8px',top:'50%',transform:'translateY(-50%)',width:'26px',height:'26px',display:'grid',placeItems:'center',borderRadius:'6px',fontSize:'20px',color:'#7b838b',cursor:'pointer'});
      del.addEventListener('click',e=>{
        e.preventDefault();e.stopPropagation();
        if(!confirm(`Chat „${chat.title||'Neuer Chat'}“ wirklich löschen?`))return;
        const remaining=load().filter(c=>c.id!==chat.id);
        localStorage.setItem(STORAGE_KEY,JSON.stringify(remaining));
        if(localStorage.getItem(ACTIVE_KEY)===chat.id){if(remaining.length)localStorage.setItem(ACTIVE_KEY,remaining[0].id);else localStorage.removeItem(ACTIVE_KEY)}
        location.reload();
      });
      item.appendChild(del);
    });
  }
  new MutationObserver(enhance).observe(list,{childList:true});
  enhance();
})();