# Music Chat Lab Pages

Dieses Repository ist ausschließlich das **öffentliche Deployment-/GitHub-Pages-Ziel von Music Chat Lab**.

## Source of Truth

Die einzige aktive Entwicklungsquelle ist:

`wibem1/Music-Chat-Lab`

Aktueller freigegebener Stand:

- Music Chat Lab **v1.0.17**
- Kompositionskern: **Engine Build 14**
- gemeinsames Projektformat: **CLAB v1**

## Struktur

Dieses Repository enthält bewusst **keine Kopie des Anwendungscodes mehr**.

Der Pages-Workflow checkt bei jedem Deployment direkt `wibem1/Music-Chat-Lab` auf `main` aus und veröffentlicht diesen freigegebenen Laufzeitstand. Dadurch kann das Deployment-Repository nicht mehr unabhängig vom Source-Repository weiterentwickelt werden oder veralten.

Im Repository selbst bleiben nur:

- `.github/workflows/pages.yml`
- diese Deployment-Dokumentation

## Regel

In diesem Repository findet keine eigenständige Funktionsentwicklung statt. Änderungen am Produkt, an MIDI-/MusicXML-Semantik, Engine-Pfaden oder Dateiformaten werden ausschließlich zuerst im Source-Repository vorgenommen.

Systemweite Architektur: `wibem1/Composer-Lab/SYSTEM-ARCHITECTURE.md`.
