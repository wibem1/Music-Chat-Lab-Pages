(function () {
  const MAX_XML_CHARS = 120000;
  const MAX_MIDI_EVENTS = 5000;

  function ext(name) {
    const i = name.lastIndexOf('.');
    return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
  }

  function noteName(n) {
    const names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    return `${names[n % 12]}${Math.floor(n / 12) - 1}`;
  }

  function readVar(data, state) {
    let value = 0, b;
    do {
      if (state.pos >= data.length) throw new Error('Unerwartetes MIDI-Dateiende.');
      b = data[state.pos++];
      value = (value << 7) | (b & 0x7f);
    } while (b & 0x80);
    return value;
  }

  function readU16(data, pos) {
    return (data[pos] << 8) | data[pos + 1];
  }

  function readU32(data, pos) {
    return ((data[pos] << 24) >>> 0) + (data[pos + 1] << 16) + (data[pos + 2] << 8) + data[pos + 3];
  }

  function ascii(data, pos, len) {
    return String.fromCharCode(...data.slice(pos, pos + len));
  }

  function parseMidi(arrayBuffer) {
    const data = new Uint8Array(arrayBuffer);
    if (data.length < 14 || ascii(data, 0, 4) !== 'MThd') throw new Error('Keine gültige Standard-MIDI-Datei.');
    const headerLen = readU32(data, 4);
    const format = readU16(data, 8);
    const tracks = readU16(data, 10);
    const division = readU16(data, 12);
    const ppq = (division & 0x8000) ? null : division;
    let pos = 8 + headerLen;
    const outTracks = [];
    const tempos = [];
    const timeSigs = [];
    let totalEvents = 0;
    let maxTick = 0;

    for (let ti = 0; ti < tracks && pos + 8 <= data.length; ti++) {
      if (ascii(data, pos, 4) !== 'MTrk') throw new Error(`MIDI-Track ${ti + 1} ist beschädigt.`);
      const len = readU32(data, pos + 4);
      const end = pos + 8 + len;
      const state = { pos: pos + 8 };
      let tick = 0;
      let running = null;
      let name = '';
      const events = [];
      const active = new Map();
      const notes = [];
      const programs = [];

      while (state.pos < end && totalEvents < MAX_MIDI_EVENTS) {
        tick += readVar(data, state);
        maxTick = Math.max(maxTick, tick);
        let status = data[state.pos++];
        let firstData = null;
        if (status < 0x80) {
          if (running == null) throw new Error('Ungültiger Running Status in MIDI-Datei.');
          firstData = status;
          status = running;
        } else if (status < 0xf0) {
          running = status;
        }

        if (status === 0xff) {
          const type = data[state.pos++];
          const mlen = readVar(data, state);
          const start = state.pos;
          state.pos += mlen;
          if (type === 0x03) name = new TextDecoder().decode(data.slice(start, start + mlen));
          else if (type === 0x51 && mlen === 3) {
            const us = (data[start] << 16) | (data[start + 1] << 8) | data[start + 2];
            tempos.push({ tick, bpm: Math.round(60000000 / us * 100) / 100 });
          } else if (type === 0x58 && mlen >= 2) {
            timeSigs.push({ tick, numerator: data[start], denominator: 2 ** data[start + 1] });
          }
          totalEvents++;
          continue;
        }
        if (status === 0xf0 || status === 0xf7) {
          const slen = readVar(data, state); state.pos += slen; totalEvents++; continue;
        }

        const kind = status & 0xf0;
        const ch = status & 0x0f;
        const needTwo = ![0xc0, 0xd0].includes(kind);
        const d1 = firstData == null ? data[state.pos++] : firstData;
        const d2 = needTwo ? data[state.pos++] : null;
        totalEvents++;

        if (kind === 0x90 && d2 > 0) {
          const key = `${ch}:${d1}`;
          if (!active.has(key)) active.set(key, []);
          active.get(key).push({ tick, velocity: d2 });
        } else if (kind === 0x80 || (kind === 0x90 && d2 === 0)) {
          const key = `${ch}:${d1}`;
          const stack = active.get(key);
          if (stack?.length) {
            const on = stack.shift();
            notes.push({ channel: ch + 1, note: d1, name: noteName(d1), start: on.tick, duration: Math.max(0, tick - on.tick), velocity: on.velocity });
          }
        } else if (kind === 0xc0) {
          programs.push({ tick, channel: ch + 1, program: d1 + 1 });
        } else if (kind === 0xb0 && [1,7,10,11,64].includes(d1)) {
          events.push({ tick, channel: ch + 1, controller: d1, value: d2 });
        }
      }
      outTracks.push({ index: ti + 1, name: name || `Track ${ti + 1}`, notes, programs, controllers: events });
      pos = end;
    }

    return { format, tracks, division, ppq, maxTick, tempos, timeSigs, trackData: outTracks, truncated: totalEvents >= MAX_MIDI_EVENTS };
  }

  function midiToText(parsed, fileName) {
    const lines = [];
    lines.push(`[MIDI-Datei: ${fileName}]`);
    lines.push(`Format ${parsed.format}, Tracks: ${parsed.tracks}, PPQ: ${parsed.ppq ?? 'SMPTE'}, Länge: ${parsed.maxTick} Ticks.`);
    if (parsed.tempos.length) lines.push(`Tempo: ${parsed.tempos.slice(0, 12).map(t => `${t.bpm} BPM @${t.tick}`).join(', ')}`);
    if (parsed.timeSigs.length) lines.push(`Taktarten: ${parsed.timeSigs.slice(0, 12).map(t => `${t.numerator}/${t.denominator} @${t.tick}`).join(', ')}`);
    parsed.trackData.forEach(t => {
      lines.push(`\nTrack ${t.index}: ${t.name}`);
      if (t.programs.length) lines.push(`Programme: ${t.programs.slice(0, 20).map(p => `Ch${p.channel} P${p.program}@${p.tick}`).join(', ')}`);
      lines.push(`Noten: ${t.notes.length}`);
      const notes = t.notes.slice(0, 1200).map(n => `${n.name} ch${n.channel} t${n.start} d${n.duration} v${n.velocity}`);
      if (notes.length) lines.push(notes.join('; '));
      if (t.notes.length > notes.length) lines.push(`… ${t.notes.length - notes.length} weitere Noten nicht einzeln dargestellt.`);
    });
    if (parsed.truncated) lines.push('\n[Hinweis: Die MIDI-Analyse wurde wegen sehr vieler Events gekürzt.]');
    return lines.join('\n');
  }

  async function musicXMLToText(file) {
    let text = await file.text();
    if (!text.includes('<score-partwise') && !text.includes('<score-timewise')) {
      throw new Error('Die Datei sieht nicht wie MusicXML aus.');
    }
    if (text.length > MAX_XML_CHARS) text = text.slice(0, MAX_XML_CHARS) + '\n<!-- gekürzt -->';
    return `[MusicXML-Datei: ${file.name}]\n${text}`;
  }

  async function genericText(file) {
    const type = file.type || '';
    const e = ext(file.name);
    if (type.startsWith('text/') || ['txt','md','json','csv','xml'].includes(e)) {
      let text = await file.text();
      if (text.length > MAX_XML_CHARS) text = text.slice(0, MAX_XML_CHARS) + '\n[gekürzt]';
      return `[Textdatei: ${file.name}]\n${text}`;
    }
    return `[Datei: ${file.name}, ${file.size} Bytes, Typ: ${type || 'unbekannt'}]\nDer Dateiinhalt wird in dieser Version noch nicht speziell verarbeitet.`;
  }

  async function fileToModelText(file) {
    const e = ext(file.name);
    if (['mid','midi'].includes(e) || file.type === 'audio/midi' || file.type === 'audio/x-midi') {
      const parsed = parseMidi(await file.arrayBuffer());
      return { kind: 'midi', text: midiToText(parsed, file.name), summary: `${parsed.trackData.reduce((a,t)=>a+t.notes.length,0)} Noten · ${parsed.tracks} Tracks` };
    }
    if (['musicxml','mxl'].includes(e)) {
      if (e === 'mxl') return { kind: 'musicxml', text: `[MusicXML-Datei: ${file.name}]\nKomprimierte .mxl-Dateien werden noch nicht entpackt. Bitte vorerst .musicxml oder unkomprimierte XML-Datei verwenden.`, summary: 'komprimierte MusicXML-Datei' };
      return { kind: 'musicxml', text: await musicXMLToText(file), summary: 'MusicXML' };
    }
    if (e === 'xml') {
      const text = await file.text();
      if (text.includes('<score-partwise') || text.includes('<score-timewise')) return { kind: 'musicxml', text: await musicXMLToText(file), summary: 'MusicXML' };
    }
    return { kind: 'generic', text: await genericText(file), summary: file.type || 'Datei' };
  }

  window.MusicFileProcessing = { fileToModelText, parseMidi };
})();
