(()=>{
'use strict';
if(window.__mclProposalUnderstandingV121)return;
window.__mclProposalUnderstandingV121=true;

// v1.1.21 — adds a neutral understanding check to new composition proposals.
// Musical decisions remain with the selected AI; this module only asks it to
// restate the user's free-form assignment before presenting its musical idea.
const wrappedFetch=window.fetch.bind(window);
const composeRe=/(kompon|erzeug|erstell|variier|variation|fortsetz|verlänger|verlaenger|verkürz|verkuerz|bearbeit|überarbeit|ueberarbeit|änder|aender|veränder|veraender|arrang|orchestr|transform|synthes|verschmelz|kombinier|verbind|ergänz|ergaenz|füge|fuege|neues\s+stück|neue\s+komposition|kurzfassung)/i;
const proposalRe=/\[MCL-(?:OPENAI-)?VORSCHLAG:[a-z0-9]+\]/i;
const tag='[MCL-VERSTAENDNISCHECK-V121]';
const instruction=`\n\n${tag}\nVERSTÄNDNISCHECK FÜR DEN VORSCHLAG: Wenn du als nächsten Schritt eine Kompositionsidee oder einen Kompositionsvorschlag formulierst, beginne den eigentlichen Vorschlag zwingend mit „Auftrag verstanden:“ und gib den Auftrag in einem kurzen Satz in eigenen Worten wieder. Nenne dabei ausdrücklich, was erzeugt oder verändert werden soll und – sofern der Nutzer etwas unverändert lassen will – was unverändert bleiben soll. Erst danach beschreibe den musikalischen Gedanken. Dies ist nur eine Verständniskontrolle; füge keine zusätzlichen technischen Regeln oder musikalischen Vorgaben hinzu.`;

function textOf(m){
 if(typeof m?.content==='string')return m.content;
 if(Array.isArray(m?.content))return m.content.map(x=>x?.text||x?.input_text||x?.output_text||'').join('');
 if(Array.isArray(m?.parts))return m.parts.map(x=>x?.text||'').join('');
 return'';
}
function immediateProposal(messages,lastUserIndex){
 if(lastUserIndex<=0)return false;
 for(let i=lastUserIndex-1;i>=0;i--){
  const m=messages[i];
  const role=m?.role;
  if(role==='user')break;
  if((role==='assistant'||role==='model')&&proposalRe.test(textOf(m)))return true;
 }
 return false;
}
function appendOpenAI(body){
 if(!Array.isArray(body?.input))return body;
 const b=JSON.parse(JSON.stringify(body));
 let i=-1;for(let n=b.input.length-1;n>=0;n--)if(b.input[n]?.role==='user'){i=n;break}
 if(i<0)return body;
 const original=textOf(b.input[i]);
 if(!composeRe.test(original)||original.includes(tag)||immediateProposal(b.input,i))return body;
 if(typeof b.input[i].content==='string')b.input[i].content=original+instruction;
 else b.input[i].content=[{type:'input_text',text:original+instruction}];
 return b;
}
function appendAnthropic(body){
 if(!Array.isArray(body?.messages))return body;
 const b=JSON.parse(JSON.stringify(body));
 let i=-1;for(let n=b.messages.length-1;n>=0;n--)if(b.messages[n]?.role==='user'){i=n;break}
 if(i<0)return body;
 const original=textOf(b.messages[i]);
 if(!composeRe.test(original)||original.includes(tag)||immediateProposal(b.messages,i))return body;
 if(typeof b.messages[i].content==='string')b.messages[i].content=original+instruction;
 else b.messages[i].content=[{type:'text',text:original+instruction}];
 return b;
}
function appendGoogle(body){
 if(!Array.isArray(body?.contents))return body;
 const b=JSON.parse(JSON.stringify(body));
 let i=-1;for(let n=b.contents.length-1;n>=0;n--)if(b.contents[n]?.role!=='model'){i=n;break}
 if(i<0)return body;
 const original=textOf(b.contents[i]);
 if(!composeRe.test(original)||original.includes(tag)||immediateProposal(b.contents,i))return body;
 b.contents[i].parts=[{text:original+instruction}];
 return b;
}
window.fetch=function(input,init={}){
 const url=typeof input==='string'?input:input?.url||'';
 if(typeof init.body!=='string')return wrappedFetch(input,init);
 let provider=null;
 if(url.includes('api.openai.com/v1/responses'))provider='openai';
 else if(url.includes('api.anthropic.com/v1/messages'))provider='anthropic';
 else if(url.includes('generativelanguage.googleapis.com/')&&url.includes(':generateContent'))provider='google';
 if(!provider)return wrappedFetch(input,init);
 try{
  const body=JSON.parse(init.body);
  const next=provider==='openai'?appendOpenAI(body):provider==='anthropic'?appendAnthropic(body):appendGoogle(body);
  if(next===body)return wrappedFetch(input,init);
  return wrappedFetch(input,{...init,body:JSON.stringify(next)});
 }catch(_){return wrappedFetch(input,init)}
};
})();
