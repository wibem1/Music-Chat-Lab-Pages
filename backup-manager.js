(()=>{
'use strict';
if(window.__mclBackupManagerV1130)return;
window.__mclBackupManagerV1130=true;

const FORMAT='music-chat-lab-backup';
const FORMAT_VERSION=1;
const APP_VERSION='1.1.30';
const PREFIX='music-chat-lab.';
const SETTINGS_KEY='music-chat-lab.api-settings.v1';
const MIDI_DB='music-chat-lab-midi';
const MIDI_STORE='workspace';
const MIDI_RECORD='current';
let protectedSettings=null;

function note(text){const el=document.getElementById('composerNote');if(el)el.textContent=text}
function safeStamp(){return new Date().toISOString().replace(/[:.]/g,'-')}
function protectSettings(){protectedSettings=localStorage.getItem(SETTINGS_KEY)}
function restoreProtectedSettings(){
  if(protectedSettings!==null&&localStorage.getItem(SETTINGS_KEY)!==protectedSettings){
    localStorage.setItem(SETTINGS_KEY,protectedSettings);
  }
}
function downloadText(text,name){
  const blob=new Blob([text],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;a.download=name;
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>{restoreProtectedSettings();URL.revokeObjectURL(url)},1500);
}

function collectLocalStorage(){
  const out={};
  for(let i=0;i<localStorage.length;i++){
    const key=localStorage.key(i);
    if(key&&key.startsWith(PREFIX))out[key]=localStorage.getItem(key);
  }
  return out;
}

function openMidiDb(){
  return new Promise((resolve,reject)=>{
    if(!('indexedDB' in window)){resolve(null);return}
    const req=indexedDB.open(MIDI_DB,1);
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains(MIDI_STORE))db.createObjectStore(MIDI_STORE);
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||new Error('MIDI-Speicher konnte nicht geöffnet werden.'));
  });
}

async function readMidiWorkspace(){
  const db=await openMidiDb();
  if(!db)return null;
  try{
    return await new Promise((resolve,reject)=>{
      const tx=db.transaction(MIDI_STORE,'readonly');
      const r=tx.objectStore(MIDI_STORE).get(MIDI_RECORD);
      r.onsuccess=()=>resolve(r.result??null);
      r.onerror=()=>reject(r.error||new Error('MIDI-Speicher konnte nicht gelesen werden.'));
    });
  }finally{db.close()}
}

async function writeMidiWorkspace(value){
  if(value==null)return;
  const db=await openMidiDb();
  if(!db)return;
  try{
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(MIDI_STORE,'readwrite');
      tx.objectStore(MIDI_STORE).put(value,MIDI_RECORD);
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(tx.error||new Error('MIDI-Speicher konnte nicht wiederhergestellt werden.'));
      tx.onabort=()=>reject(tx.error||new Error('MIDI-Speicher konnte nicht wiederhergestellt werden.'));
    });
  }finally{db.close()}
}

function apiKeyStatus(local){
  let s={};
  try{s=JSON.parse(local[SETTINGS_KEY]||'{}')}catch(_){ }
  return {anthropic:!!s.anthropicKey,openai:!!s.openaiKey,google:!!s.googleKey};
}

async function createBackup(){
  try{
    protectSettings();
    const local=collectLocalStorage();
    const keys=apiKeyStatus(local);
    const backup={
      format:FORMAT,
      version:FORMAT_VERSION,
      appVersion:APP_VERSION,
      createdAt:new Date().toISOString(),
      containsApiKeys:keys.anthropic||keys.openai||keys.google,
      apiKeyStatus:keys,
      localStorage:local,
      indexedDB:{[MIDI_DB]:{[MIDI_STORE]:await readMidiWorkspace()}}
    };
    downloadText(JSON.stringify(backup,null,2),`Music-Chat-Lab-Backup-${safeStamp()}.mclbackup`);
    note(`Backup erstellt. API-Schlüssel enthalten: ${backup.containsApiKeys?'ja':'nein'}.`);
  }catch(e){
    restoreProtectedSettings();
    note('Backup konnte nicht erstellt werden: '+(e?.message||String(e)));
  }
}

function validateBackup(x){
  if(!x||x.format!==FORMAT||Number(x.version)!==FORMAT_VERSION||!x.localStorage||typeof x.localStorage!=='object'){
    throw new Error('Keine gültige Music-Chat-Lab-Backup-Datei.');
  }
  const bad=Object.keys(x.localStorage).filter(k=>!k.startsWith(PREFIX));
  if(bad.length)throw new Error('Die Backup-Datei enthält fremde Speicherschlüssel und wird nicht importiert.');
}

async function restoreBackupFile(file){
  let data;
  try{data=JSON.parse(await file.text())}
  catch{throw new Error('Die Backup-Datei ist kein gültiges JSON.')}
  validateBackup(data);
  const keyInfo=data.apiKeyStatus||{};
  const msg=`Dieses Backup ersetzt den aktuellen lokalen Music-Chat-Lab-Zustand.\n\nEnthaltene API-Schlüssel: Anthropic ${keyInfo.anthropic?'ja':'nein'}, OpenAI ${keyInfo.openai?'ja':'nein'}, Google ${keyInfo.google?'ja':'nein'}.\n\nBackup wirklich wiederherstellen?`;
  if(!window.confirm(msg))return;

  protectedSettings=null;
  const current=[];
  for(let i=0;i<localStorage.length;i++){
    const k=localStorage.key(i);
    if(k&&k.startsWith(PREFIX))current.push(k);
  }
  current.forEach(k=>localStorage.removeItem(k));
  for(const [k,v] of Object.entries(data.localStorage)){
    if(typeof v==='string')localStorage.setItem(k,v);
  }
  const midi=data.indexedDB?.[MIDI_DB]?.[MIDI_STORE];
  if(midi!=null)await writeMidiWorkspace(midi);
  note('Backup wiederhergestellt. Music Chat Lab wird neu geladen.');
  setTimeout(()=>location.reload(),250);
}

function start(){
  const save=document.getElementById('backupCreateButton');
  const load=document.getElementById('backupRestoreButton');
  const input=document.getElementById('backupFileInput');
  save?.addEventListener('click',e=>{e.preventDefault();createBackup()});
  load?.addEventListener('click',e=>{e.preventDefault();if(input){input.value='';input.click()}});
  input?.addEventListener('change',async()=>{
    const f=input.files?.[0];
    if(!f)return;
    try{await restoreBackupFile(f)}
    catch(e){note('Backup konnte nicht wiederhergestellt werden: '+(e?.message||String(e)))}
  });
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')restoreProtectedSettings()});
  window.addEventListener('pageshow',restoreProtectedSettings);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
else start();
})();
