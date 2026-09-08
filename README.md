# Music Chat Lab Pages

Dieses Repository ist ausschließlich das **öffentliche Deployment-/GitHub-Pages-Ziel von Music Chat Lab**.

## Source of Truth

Die einzige aktive Entwicklungsquelle ist:

`wibem1/Music-Chat-Lab`

Aktueller freigegebener Stand:

- Music Chat Lab **v1.0.17**
- Kompositionskern: **Engine Build 14**
- gemeinsames Projektformat: **CLAB v1**

## Deployment-Snapshot

Weil das Quell-Repository `Music-Chat-Lab` privat ist, kann der normale `GITHUB_TOKEN` dieses öffentlichen Pages-Repositories es nicht direkt auschecken. Deshalb enthält dieses Repository einen **gespiegelten Laufzeit-Snapshot** des jeweils freigegebenen Stands.

Dieser Snapshot ist ausdrücklich **keine zweite Entwicklungsquelle**. Änderungen am Produkt werden ausschließlich in `wibem1/Music-Chat-Lab` vorgenommen und anschließend als freigegebener Deployment-Snapshot hierher gespiegelt.

Der Pages-Workflow veröffentlicht nur diesen Snapshot. Dadurch sind keine zusätzlichen privaten Tokens oder Secrets für das Deployment nötig.

## Regel

In diesem Repository findet keine eigenständige Funktionsentwicklung statt. Änderungen an MIDI-/MusicXML-Semantik, Engine-Pfaden, CLAB oder Bedienung werden ausschließlich zuerst im Source-Repository vorgenommen.

Systemweite Architektur: `wibem1/Composer-Lab/SYSTEM-ARCHITECTURE.md`.
