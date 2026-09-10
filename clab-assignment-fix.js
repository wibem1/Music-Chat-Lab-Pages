(()=>{
'use strict';
if(window.__mclClabAssignmentFixV123)return;
window.__mclClabAssignmentFixV123=true;
const CHAT_KEY='music-chat-lab.chats.v1',ACTIVE_KEY='music-chat-lab.active-chat.v1';
const api=window.MCLCLAB;if(!api?.makeDocument)return;
const originalMake=api.makeDocument.bind(api);

function parseScore(text){
  let s=String(text||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  const a=s.indexOf('{'),b=s.lastIndexOf('}');if(a<0||b<=a)return null;
  try{const x=JSON.parse(s.slice(a,b+1));return Array.isArray(x?.tr)?x:null}catch(_){return null}
}
function cleanUser(m){return String(m?.displayText||m?.text||'').replace(/\[MCL-(?:ENGINE14-SCORE|CLAB-SCORE)[\s\S]*$/i,'').trim()}
function isConfirmation(s){return /^(ja|j|ok|okay|mach das|mache das|bitte|los|ausführen|ausfuehren|genau|einverstanden)[.!?]*$/i.test(String(s||'').trim())}
function activeChat(){
  try{const chats=JSON.parse(localStorage.getItem(CHAT_KEY)||'[]'),id=localStorage.getItem(ACTIVE_KEY);return chats.find(c=>c.id===id)||chats[0]||null}catch(_){return null}
}
function sameScore(a,b){try{return JSON.stringify(a)===JSON.stringify(b)}catch(_){return false}}
function assignmentFor(score){
  const loaded=api.getLoadedDocument?.();
  if(loaded?.score&&sameScore(loaded.score,score)&&String(loaded.assignment||'').trim())return String(loaded.assignment).trim();
  const chat=activeChat(),messages=chat?.messages||[];let scoreIndex=-1;
  for(let i=messages.length-1;i>=0;i--){
    const m=messages[i];if(m?.role!=='assistant'||m?.isError||m?.thinking)continue;
    const s=parseScore(m.text);if(s&&sameScore(s,score)){scoreIndex=i;break}
  }
  if(scoreIndex<0){
    for(let i=messages.length-1;i>=0;i--){const m=messages[i];if(m?.role==='assistant'&&parseScore(m.text)){scoreIndex=i;break}}
  }
  if(scoreIndex<0)return'';
  let proposalIndex=-1;
  for(let i=scoreIndex-1;i>=0;i--){
    const m=messages[i];
    if(m?.role==='assistant'&&/\[MCL-(?:OPENAI-)?VORSCHLAG:[a-z0-9]+\]/i.test(String(m.text||''))){proposalIndex=i;break}
  }
  const start=proposalIndex>=0?proposalIndex-1:scoreIndex-1;
  for(let i=start;i>=0;i--){
    const m=messages[i];if(m?.role!=='user'||m?.isError||m?.thinking)continue;
    const s=cleanUser(m);if(s&&!isConfirmation(s))return s;
  }
  return'';
}
api.makeDocument=function(){
  const doc=originalMake();
  const a=assignmentFor(doc?.score);
  if(a)doc.assignment=a;
  return doc;
};
})();
