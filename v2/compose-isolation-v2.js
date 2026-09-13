(()=>{
'use strict';
if(window.__mclComposeIsolationV2)return;window.__mclComposeIsolationV2=true;
const VERSION='2.0.0-alpha.2';
const sessionFetch=window.fetch.bind(window);
const minimalFetch=window.__MCL_MINIMAL_FETCH;
if(!minimalFetch){console.warn('MusicChatLab 2.0: minimal fetch path missing.');return;}
const TECH=`TECHNISCHER AUSGABEVERTRAG:\nAntworte ausschließlich mit genau einem validen JSON-Objekt für eine MIDI-Komposition. Keine Einleitung, kein Kommentar, kein Markdown.\nFormat:\n{\"ti\":\"Titel\",\"bpm\":96,\"ts\":{\"n\":4,\"d\":4},\"k\":\"C major\",\"sm\":\"Kurze Beschreibung\",\"tr\":[{\"nm\":\"Piano\",\"ch\":0,\"pg\":0,\"nt\":[[0,1,60,80,0,0.95]],\"ct\":[]}]}\nnt=[StartBeat,Dauer,Pitch,Velocity,Staff,Gate]. ct=[Beat,CC,Wert]. Verwende gültige MIDI-Pitches 0-127, Velocity 1-127 und nichtnegative Beat-Positionen.\nDieser Vertrag enthält keine musikalischen Vorgaben zu Stil, Harmonik, Melodik, Rhythmik, Form, Artikulation oder kompositorischer Qualität.`;
function providerFor(url){const u=String(url||'');if(u.includes('api.anthropic.com/v1/messages'))return'anthropic';if(u.includes('api.openai.com/v1/responses'))return'openai';if(u.includes('generativelanguage.googleapis.com/')&&u.includes(':generateContent'))return'google';return null}
function textOf(x){if(typeof x==='string')return x;if(Array.isArray(x))return x.map(p=>p?.text||p?.input_text||p?.output_text||'').join('');return''}
function lastUser(provider,b){if(provider==='anthropic'){const a=Array.isArray(b.messages)?b.messages:[];for(let i=a.length-1;i>=0;i--)if(a[i]?.role==='user')return textOf(a[i].content)}if(provider==='openai'){const a=Array.isArray(b.input)?b.input:[];for(let i=a.length-1;i>=0;i--)if(a[i]?.role==='user')return textOf(a[i].content)}if(provider==='google'){const a=Array.isArray(b.contents)?b.contents:[];for(let i=a.length-1;i>=0;i--)if(a[i]?.role==='user')return textOf(a[i].parts)}return''}
function stripContext(s){return String(s||'').replace(/\n*--- MUSIKALISCHER ARBEITSTISCH(?: \(KATALOG\))? ---[\s\S]*?--- ENDE MUSIKALISCHER ARBEITSTISCH(?: \(KATALOG\))? ---\n*/g,'\n').replace(/\n*--- AUSGEWÄHLTES MUSIKMATERIAL ---[\s\S]*?--- ENDE AUSGEWÄHLTES MUSIKMATERIAL ---\n*/g,'\n').replace(/\n*--- AUTOMATISCH BEREITGESTELLTES MUSIKMATERIAL ---[\s\S]*?--- ENDE AUTOMATISCH BEREITGESTELLTES MUSIKMATERIAL ---\n*/g,'\n').replace(/\n{3,}/g,'\n\n').trim()}
function refersToExisting(s){return /\b(?:Speicher(?:platz)?\s*\d+|dieses Stück|diese Komposition|aktuelle Komposition|davon|daraus|vorhandene(?:s|n)? Stück)\b/i.test(String(s||''))}
function minimalBody(provider,b,user){if(provider==='anthropic')return{model:b.model,max_tokens:Math.max(12000,Number(b.max_tokens)||0),system:TECH,messages:[{role:'user',content:user}]};if(provider==='openai')return{model:b.model,input:[{role:'system',content:TECH},{role:'user',content:user}],store:false};const g={...(b.generationConfig||{}),maxOutputTokens:Math.max(12000,Number(b.generationConfig?.maxOutputTokens)||0),responseMimeType:'application/json'};return{systemInstruction:{parts:[{text:TECH}]},contents:[{role:'user',parts:[{text:user}]}],generationConfig:g}}
window.fetch=async function(input,init={}){
 const url=typeof input==='string'?input:input?.url||'',provider=providerFor(url);
 if(!provider||window.MCLRequestMode!=='compose'||typeof init.body!=='string')return sessionFetch(input,init);
 let body;try{body=JSON.parse(init.body)}catch{return sessionFetch(input,init)}
 const raw=lastUser(provider,body),hasScore=/\[MCL-ENGINE14-SCORE\b/i.test(raw),user=stripContext(raw);
 if(hasScore||refersToExisting(user))return sessionFetch(input,init);
 if(!user)return sessionFetch(input,init);
 const note=document.getElementById('composerNote');if(note)note.textContent='Isolierte Neukomposition · ohne Chat-Gedächtnis, Arbeitstisch oder Vorab-Idee.';
 return minimalFetch(input,{...init,body:JSON.stringify(minimalBody(provider,body,user))});
};
window.MCLComposeIsolationV2={version:VERSION};
})();
