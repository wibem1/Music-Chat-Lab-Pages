(() => {
  'use strict';

  // Composition Lab Engine Build 14 integration for Music Chat Lab.
  // Normal chat and analysis stay in app.js; composition requests use the
  // shared Score semantics and the Build-14 concept/composition flow.

  const SYSTEM_PREFIX = `Du bist ein Kompositions- und Produktionsassistent für MIDI.\nErfinde selbständige, geschlossene Musik nach dem Auftrag des Nutzers. Achte auf Stimmführung, Dynamik (Velocity 1-127), Rhythmik und Artikulation.`;

  const TECHNICAL_PROMPT = `NOTATION UND AUSGABE:\n- "d" = Notierter Wert in Viertelnoten-Beats (0.125, 0.25, 0.333333, 0.5, 0.666667, 0.75, 1, 1.5, 2, 3, 4, 6, 8).\n- "g" = Gate/Klingdauer als Faktor (z.B. 0.95 = normal, 0.5 = staccato, 1.05 = legato).\n- "st" = System (0=Standard, 1=Rechte Hand / oberes System, 2=Linke Hand / unteres System).\n- Format: JSON mit folgender Struktur:\n{\n  "ti": "Titel",\n  "bpm": 96,\n  "ts": {"n": 4, "d": 4},\n  "k": "e minor",\n  "sm": "Kurze Zusammenfassung",\n  "tr": [\n    {\n      "nm": "Piano",\n      "ch": 0,\n      "pg": 0,\n      "nt": [[0.0, 1.0, 60, 80, 1]],\n      "ct": [[0.0, 64, 0]]\n    }\n  ]\n}\nnt-Array: [StartBeat, Dauer, Pitch, Velocity, Staff, Gate] (Gate ist optional, Standard 0.95).\nct-Array: [Beat, CC, Wert].\nGib ausschließlich valides JSON aus.`;

  const nativeFetch = window.fetch.bind(window);
  const originalFileToModelText = window.MusicFileProcessing?.fileToModelText;
  const parseMidi = window.MusicFileProcessing?.parseMidi;

  const MAJOR_KEYS = ['Cb','Gb','Db','Ab','Eb','Bb','F','C','G','D','A','E','B','F#','C#'];
  const MINOR_KEYS = ['Ab','Eb','Bb','F','C','G','D','A','E','B','F#','C#','G#','D#','A#'];

  function round6(n) { return Math.round(Number(n) * 1e6) / 1e6; }

  function keyNameFromMeta(meta) {
    if (!meta || !Number.isFinite(Number(meta.fifths))) return '';
    const fifths = Math.max(-7, Math.min(7, Number(meta.fifths)));
    const roots = meta.minor ? MINOR_KEYS : MAJOR_KEYS;
    return `${roots[fifths + 7]} ${meta.minor ? 'minor' : 'major'}`;
  }

  function parseKeySignature(value) {
    const raw = String(value || '').trim();
    if (!raw || /^frei$/i.test(raw)) return null;
    const normalized = raw
      .replace(/♯/g, '#').replace(/♭/g, 'b')
      .replace(/-dur\b/i, ' major').replace(/-moll\b/i, ' minor')
      .replace(/\bdur\b/i, ' major').replace(/\bmoll\b/i, ' minor')
      .replace(/\s+/g, ' ').trim();
    const minor = /\bminor\b/i.test(normalized) || /\bm\b/i.test(normalized);
    const root = normalized.split(' ')[0].replace(/^([a-g])([#b]?)$/i, (_, a, acc) => a.toUpperCase() + acc);
    const roots = minor ? MINOR_KEYS : MAJOR_KEYS;
    const index = roots.findIndex(k => k.toLowerCase() === root.toLowerCase());
    if (index < 0) return null;
    return { fifths: index - 7, minor };
  }

  function parsedToScore(parsed, fileName) {
    const ppq = Number(parsed.ppq) || 480;
    const bpm = Number(parsed.tempos?.[0]?.bpm) || 96;
    const sig = parsed.timeSigs?.[0] || { numerator: 4, denominator: 4 };
    const tracks = [];

    for (const t of parsed.trackData || []) {
      if (!t.notes?.length) continue;
      const channels = [...new Set(t.notes.map(n => Number(n.channel) || 1))];
      for (const channel1 of channels) {
        const notes = t.notes.filter(n => (Number(n.channel) || 1) === channel1);
        if (!notes.length) continue;
        const programEvent = (t.programs || []).find(p => Number(p.channel) === channel1);
        const controls = (t.controllers || []).filter(c => Number(c.channel) === channel1);
        tracks.push({
          nm: channels.length > 1 ? `${t.name} Ch ${channel1}` : (t.name || `Track ${t.index}`),
          ch: Math.max(0, Math.min(15, channel1 - 1)),
          pg: Math.max(0, Math.min(127, (Number(programEvent?.program) || 1) - 1)),
          nt: notes.map(n => [
            round6(Number(n.start) / ppq),
            round6(Math.max(1, Number(n.duration)) / ppq),
            Number(n.note),
            Number(n.velocity),
            0,
            1.0
          ]),
          ct: controls.map(c => [round6(Number(c.tick) / ppq), Number(c.controller), Number(c.value)])
        });
      }
    }

    return {
      ti: String(fileName || 'Importierte MIDI-Datei').replace(/\.(mid|midi)$/i, ''),
      bpm,
      ts: { n: Number(sig.numerator) || 4, d: Number(sig.denominator) || 4 },
      k: keyNameFromMeta(parsed.keySigs?.[0]),
      sm: 'Importierte MIDI-Datei',
      tr: tracks
    };
  }

  if (originalFileToModelText && parseMidi) {
    window.MusicFileProcessing.fileToModelText = async function(file) {
      const lower = String(file.name || '').toLowerCase();
      if (lower.endsWith('.mid') || lower.endsWith('.midi') || file.type === 'audio/midi' || file.type === 'audio/x-midi') {
        const parsed = parseMidi(await file.arrayBuffer());
        const score = parsedToScore(parsed, file.name);
        const noteCount = score.tr.reduce((sum, t) => sum + (t.nt?.length || 0), 0);
        return {
          kind: 'midi',
          text: `[MCL-ENGINE14-SCORE name=${JSON.stringify(file.name)}]\n${JSON.stringify(score)}\n[/MCL-ENGINE14-SCORE]`,
          summary: `${noteCount} Noten · ${parsed.tracks} Tracks`
        };
      }
      return originalFileToModelText(file);
    };
  }

  function lastUserMessage(body) {
    const messages = Array.isArray(body?.messages) ? body.messages : [];
    return [...messages].reverse().find(m => m.role === 'user' && typeof m.content === 'string') || null;
  }

  function isCompositionRequest(text) {
    const t = String(text || '').slice(0, 16000);
    return /(komponier|erzeug|erstelle|variier|variation|fortsetz|verlänger|verkürz|bearbeit|arrangier|orchestrier|transformier|neues\s+stück|neue\s+komposition|kurzfassung|füge[^\n]{0,100}(?:stück|komposition|variation))/i.test(t);
  }

  function extractTaskAndSources(text) {
    const sourceRe = /\[MCL-ENGINE14-SCORE name=("(?:[^"\\]|\\.)*")\]\n([\s\S]*?)\n\[\/MCL-ENGINE14-SCORE\]/g;
    const sources = [];
    let m;
    while ((m = sourceRe.exec(text))) {
      try { sources.push({ name: JSON.parse(m[1]), score: JSON.parse(m[2]) }); } catch (_) {}
    }
    const task = String(text || '')
      .replace(/\n\n--- DATEIANHÄNGE ---\n?/g, '\n')
      .replace(sourceRe, '')
      .trim();
    return { task, sources };
  }

  function assignmentFrom(task, sources) {
    let a = `Auftrag:\n${task}`;
    if (sources.length === 1) {
      a += `\n\nVORHANDENES MATERIAL (${sources[0].name}):\n${JSON.stringify(sources[0].score)}`;
    } else if (sources.length > 1) {
      sources.forEach((s, i) => {
        a += `\n\nVORHANDENES MATERIAL ${i + 1} (${s.name}):\n${JSON.stringify(s.score)}`;
      });
    }
    return a;
  }

  async function anthropicCall(url, headers, model, system, user) {
    const body = {
      model,
      max_tokens: 32000,
      output_config: { effort: 'medium' },
      system,
      messages: [{ role: 'user', content: user }]
    };
    return nativeFetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  }

  window.fetch = async function(input, init = {}) {
    const url = typeof input === 'string' ? input : input?.url || '';
    if (!url.includes('api.anthropic.com/v1/messages') || typeof init?.body !== 'string') {
      return nativeFetch(input, init);
    }

    try {
      const originalBody = JSON.parse(init.body);
      const last = lastUserMessage(originalBody);
      if (!last || !isCompositionRequest(last.content)) return nativeFetch(input, init);

      const { task, sources } = extractTaskAndSources(last.content);
      const assignment = assignmentFrom(task, sources);
      const conceptPrompt = `Formuliere einen kurzen musikalischen Gedanken/Impuls für folgenden Auftrag:\n\n${assignment}`;

      const conceptResponse = await anthropicCall(url, init.headers, originalBody.model, SYSTEM_PREFIX, conceptPrompt);
      if (!conceptResponse.ok) return conceptResponse;
      const conceptData = await conceptResponse.json().catch(() => ({}));
      const concept = (conceptData.content || []).filter(x => x.type === 'text').map(x => x.text || '').join('').trim();

      const compPrompt = `${TECHNICAL_PROMPT}\n\nAUFTRAG:\n${assignment}\n\nDEIN KONZEPT:\n${concept}\n\nGib jetzt die fertige JSON-Partitur aus.`;
      return anthropicCall(url, init.headers, originalBody.model, SYSTEM_PREFIX, compPrompt);
    } catch (_) {
      return nativeFetch(input, init);
    }
  };

  function extractScore(text) {
    let s = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const a = s.indexOf('{'), b = s.lastIndexOf('}');
    if (a < 0 || b < a) return null;
    try {
      const score = JSON.parse(s.slice(a, b + 1));
      return Array.isArray(score?.tr) ? score : null;
    } catch (_) { return null; }
  }

  function vlq(value) {
    value = Math.max(0, Math.floor(value));
    let buffer = value & 0x7f;
    const out = [];
    while ((value >>= 7)) { buffer <<= 8; buffer |= ((value & 0x7f) | 0x80); }
    while (true) { out.push(buffer & 0xff); if (buffer & 0x80) buffer >>= 8; else break; }
    return out;
  }
  function u16(n){ return [(n>>8)&255,n&255]; }
  function u32(n){ return [(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255]; }
  function bytes(s){ return Array.from(new TextEncoder().encode(String(s))); }
  function mtrk(events){
    events.sort((a,b)=>a.t-b.t||a.o-b.o); let last=0, out=[];
    for(const e of events){ out.push(...vlq(e.t-last),...e.b); last=e.t; }
    out.push(0,0xff,0x2f,0); return [...bytes('MTrk'),...u32(out.length),...out];
  }

  function buildMidi(score){
    const PPQ=480, chunks=[];
    const bpm=Math.max(20,Math.min(300,Number(score.bpm)||96));
    const ts=score.ts||{n:4,d:4};
    const mpqn=Math.round(60000000/bpm);
    const conductor=[
      {t:0,o:0,b:[0xff,0x51,0x03,(mpqn>>>16)&255,(mpqn>>>8)&255,mpqn&255]},
      {t:0,o:1,b:[0xff,0x58,0x04,Math.max(1,Number(ts.n)||4),Math.max(0,Math.round(Math.log2(Math.max(1,Number(ts.d)||4)))),24,8]}
    ];
    const key=parseKeySignature(score.k);
    if(key){ conductor.push({t:0,o:2,b:[0xff,0x59,0x02,key.fifths&0xff,key.minor?1:0]}); }
    chunks.push(mtrk(conductor));

    (score.tr||[]).forEach((tr,ix)=>{
      const ch=Math.max(0,Math.min(15,Number(tr.ch??ix)%16));
      const ev=[]; const nm=bytes(tr.nm||`Track ${ix+1}`);
      ev.push({t:0,o:0,b:[0xff,0x03,...vlq(nm.length),...nm]});
      ev.push({t:0,o:1,b:[0xc0|ch,Math.max(0,Math.min(127,Number(tr.pg)||0))]});
      (tr.ct||[]).forEach((c,i)=>ev.push({t:Math.max(0,Math.round(Number(c[0])*PPQ)),o:10+i,b:[0xb0|ch,Math.max(0,Math.min(127,Number(c[1])||0)),Math.max(0,Math.min(127,Number(c[2])||0))]}));
      (tr.nt||[]).forEach((n,i)=>{
        const start=Math.max(0,Math.round(Number(n[0])*PPQ));
        const dur=Math.max(1,Math.round(Number(n[1])*PPQ));
        const gate=Number.isFinite(Number(n[5]))?Number(n[5]):0.95;
        const end=Math.max(start+1,Math.round(start+dur*gate));
        const p=Math.max(0,Math.min(127,Math.round(Number(n[2]))));
        const v=Math.max(1,Math.min(127,Math.round(Number(n[3])||80)));
        ev.push({t:start,o:100+i*2,b:[0x90|ch,p,v]},{t:end,o:101+i*2,b:[0x80|ch,p,0]});
      });
      chunks.push(mtrk(ev));
    });
    const header=[...bytes('MThd'),...u32(6),...u16(1),...u16(chunks.length),...u16(PPQ)];
    return new Blob([new Uint8Array([...header,...chunks.flat()])],{type:'application/octet-stream'});
  }

  function filename(score){
    const base=String(score.ti||'Music Chat Lab').replace(/[\\/:*?"<>|]+/g,'_').trim()||'Music Chat Lab';
    return base.toLowerCase().endsWith('.mid')?base:`${base}.mid`;
  }

  function download(blob,name){
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob); a.download=name; a.style.display='none';
    document.body.appendChild(a); a.click();
    setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},2500);
  }

  function enhance(){
    document.querySelectorAll('.message-row.assistant').forEach(row=>{
      if(row.dataset.engine14Enhanced==='1')return;
      const bubble=row.querySelector('.message-bubble'); if(!bubble)return;
      const score=extractScore(bubble.textContent||'');
      if(!score){row.dataset.engine14Enhanced='1';return;}
      const name=filename(score);
      bubble.textContent=score.sm||'MIDI-Komposition wurde erzeugt.';
      const btn=document.createElement('button');
      btn.className='generated-file-button'; btn.textContent=`⬇ ${name}`;
      btn.addEventListener('click',()=>download(buildMidi(score),name));
      bubble.appendChild(document.createElement('br')); bubble.appendChild(btn);
      row.dataset.engine14Enhanced='1';
    });
  }

  const obs=new MutationObserver(enhance);
  window.addEventListener('DOMContentLoaded',()=>{obs.observe(document.body,{subtree:true,childList:true});enhance();});
})();
