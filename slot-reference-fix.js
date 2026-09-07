(()=>{
  function explicitNumbers(text){
    const s=String(text||'');
    const out=[];
    const add=n=>{n=Number(n);if(n>=1&&n<=6&&!out.includes(n))out.push(n)};
    for(const m of s.matchAll(/\b(?:stück|speicher(?:platz)?|platz)\s*([1-6])\b/gi))add(m[1]);
    if(out.length){
      for(const m of s.matchAll(/(?:\bund\b|\bmit\b|,|&)\s*(?:(?:stück|speicher(?:platz)?|platz)\s*)?([1-6])\b/gi))add(m[1]);
    }
    return out;
  }
  window.slotNumbersExplicit=explicitNumbers;
  window.slotNumbers=function(text){
    const s=String(text||'');
    const explicit=explicitNumbers(s);
    if(explicit.length)return explicit;
    const all=window.MCLMidiSlots?.all?.()||[];
    if(/\balle(?:n)?\s+(?:stücke|dateien|kompositionen|vorlagen)\b/i.test(s))return all.map(x=>x.slot);
    if(/\b(?:beide|beiden)\s+(?:stücke|dateien|kompositionen|vorlagen)\b/i.test(s)&&all.length===2)return all.map(x=>x.slot);
    return [];
  };
  window.slotReferenceIssue=function(text){
    const s=String(text||'');
    const all=window.MCLMidiSlots?.all?.()||[];
    const explicit=explicitNumbers(s);
    if(explicit.length){
      const occupied=new Set(all.map(x=>Number(x.slot)));
      const missing=explicit.filter(n=>!occupied.has(n));
      if(missing.length)return `Speicherplatz ${missing.join(' und ')} ist nicht belegt.`;
      return '';
    }
    if(/\b(?:beide|beiden)\s+(?:stücke|dateien|kompositionen|vorlagen)\b/i.test(s)&&all.length!==2){
      return all.length?`„Beide Stücke“ ist bei ${all.length} belegten Speicherplätzen nicht eindeutig. Bitte nenne die Stücknummern, z. B. „Stück 1 und Stück 3“.`:'Es sind keine MIDI-Speicherplätze belegt.';
    }
    if(/\balle(?:n)?\s+(?:stücke|dateien|kompositionen|vorlagen)\b/i.test(s)&&!all.length)return 'Es sind keine MIDI-Speicherplätze belegt.';
    return '';
  };
})();