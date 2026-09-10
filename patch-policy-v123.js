(()=>{
'use strict';
if(window.__mclPatchPolicyV123)return;
window.__mclPatchPolicyV123=true;
const api=window.MCLCompositionEdit;
if(!api)return;
api.protocol=`BEARBEITUNGS- UND AUSGABESTRATEGIE:
- Entscheide ausschließlich aus dem freien Nutzerauftrag, welche Musik erzeugt oder verändert werden soll. Die App macht keine musikalischen Sonderregeln.
- Wenn vorhandenes Material ergänzt oder teilweise verändert wird und irgendein Teil des Ausgangsmaterials unverändert erhalten bleiben soll, MUSST du PATCH-JSON verwenden. Gib unveränderte Tracks oder unveränderte Bereiche dann NICHT erneut aus.
- Eine vollständige Partitur darfst du nur ausgeben, wenn kein Teil eines vorhandenen Ausgangsscores unverändert übernommen werden soll oder wenn vollständig neue Musik ohne Ausgangsmaterial entsteht.
- Das Ergebnis für den Nutzer ist trotzdem immer die vollständige Komposition: Die App setzt PATCH und unverändertes Ausgangsmaterial anschließend selbst zusammen.

PATCH-FORMAT:
{
  "mode":"patch",
  "base":1,
  "ti":"Neuer Titel",
  "sm":"Kurze Zusammenfassung",
  "meta":{"bpm":74,"ts":{"n":4,"d":4},"k":"C major"},
  "ops":[
    {"op":"add_track","track":{"nm":"Neue Spur","ch":1,"pg":40,"nt":[...],"ct":[...]}},
    {"op":"insert_track","index":0,"track":{...}},
    {"op":"replace_track","index":0,"track":{...}},
    {"op":"delete_track","index":0},
    {"op":"replace_range","index":0,"start":16,"end":32,"nt":[...],"ct":[...]}
  ]
}
- "base" ist die Nummer des verwendeten Ausgangsmaterials, beginnend bei 1.
- Track-"index" beginnt bei 0. Alternativ darf bei replace_track, delete_track und replace_range ein eindeutiger exakter Trackname als "name" verwendet werden.
- Bei replace_range sind start und end globale Beat-Positionen; nur Ereignisse mit Startposition im Bereich [start,end) werden ersetzt.
- "meta" ist optional. Nicht genannte Metadaten bleiben unverändert.
- Nicht genannte Tracks und Bereiche bleiben unverändert.
- Antworte ausschließlich mit genau einem validen JSON-Objekt, ohne Markdown oder Kommentar.`;
})();
