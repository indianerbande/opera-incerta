# Projektstatus von Opera Incerta

[English](../en/project-status.md) | **Deutsch**

Status: Öffentliche Quell-Beta

Aktuelle Veröffentlichung: `v0.1.0-beta.1`

Aktualisiert: 2026-09-11

Dieses Dokument nennt den Reifegrad des Produkts und die Grenzen der Beta. Es
ist kein Entwicklungstagebuch. Die Produktanforderungen stehen in der
[Spezifikation](../engineering/specification.md), die Nachweisregeln in
[testing](../engineering/testing.md), die abgeschlossene Arbeit samt
Begründung in [completed work](../engineering/completed-work.md) und die
offenen technischen Punkte in der [Roadmap](../engineering/roadmap.md) — alle
vier auf Englisch.

## Was Beta hier bedeutet

Opera Incerta ist benutzbare Software. Ein Manuskript lässt sich anlegen oder
aus einem vorhandenen Ordner übernehmen, schreiben, strukturieren,
kategorisieren, durchsuchen, gegen Git versionieren und exportieren. Es ist
kein Parser-Experiment und keine leere Anwendungshülle.

Die Kennzeichnung als Beta macht zwei Zusagen bewusst schwächer als eine
stabile Veröffentlichung:

1. **Es gibt keine signierten Installer.** Der Quellcode kann native Pakete
   erzeugen, aber das wurde auf keinem Wirtssystem durchgeführt, und die
   Signierung und Beglaubigung bei Apple sowie die Herausgebersignatur bei
   Windows stehen aus. Die Beta wird als Quellcode verteilt.
2. **Benannte Fähigkeiten sind spezifiziert, aber nicht gebaut.** Import,
   KI-Assistent und Schnappschüsse haben angenommene Spezifikationen und keine
   Umsetzung. Sie stehen unten aufgeführt, statt durch Schweigen angedeutet zu
   werden.

Die Beta eignet sich zum Ausprobieren, zum lokalen Schreiben, für Bauten aus
dem Quellcode und für Beiträge. Sie ist noch keine offiziell signierte
Binärverteilung.

## Worauf die Aussagen tatsächlich beruhen

Die Behauptungen dieses Dokuments stützen sich auf Prüfstände, die in diesem
Checkout laufen:

| Prüfstand | Was er tut | Ergebnis |
| --- | --- | --- |
| `pnpm run check` | Baut neun Workspace-Projekte, prüft die Typen des Testcodes, führt jede Prüfsammlung aus, verifiziert die Grenze der paketierten Anwendung, die per Hash festgelegten Medien und diese Dokumentation | grün, **1106 Tests** |
| `pnpm run desktop:smoke` | Startet die echte Electron-Hülle und treibt den echten Renderer mit echten Eingabeereignissen; liest die Ergebnisse von der Platte und aus Git | grün, **45 Prüfungen** |
| `pnpm run spike:editor` | Führt den Adaptervertrag des Editors in einer echten Rendering-Maschine aus | grün, 7/7 |

Die Schreibtischprüfung wiegt für eine Aussage über Verhalten am schwersten:
Sie fragt die Anwendung nicht, ob sie eine Datei gespeichert hat, sondern
liest die Datei.

## In dieser Beta vorhanden

### Die Bibliothek

- Markdown-Dateien auf der Platte als einzige Wahrheit — ein Text ist eine
  Datei, Gruppen sind Verzeichnisse, und was der Dateimanager zeigt, zeigt die
  Anwendung.
- Eigene Variablen unter einem Namensraum, wobei fremde Schlüssel anderer
  Werkzeuge Byte für Byte über Laden und Speichern erhalten bleiben.
- Anlegen, Umbenennen, Umordnen per echtem Ziehen und Löschen in den
  Papierkorb des Systems. **Umbenennen ändert einen Titel, nie einen
  Dateinamen.**
- Seitenkategorien mit Farben, je Projekt festgelegt.
- Einen Ordner öffnen, der kein Projekt ist: Er kann eines werden, oder ein
  Projekt darin wird angeboten, oder mehrere werden benannt.
- Ein Beobachter: Eine hinter dem Rücken der Anwendung geänderte Datei
  erreicht den Editor, und eine Änderung unter ungespeicherter Arbeit fragt,
  bevor etwas verloren geht.

### Der Editor

- Gezeigte statt ausgeschriebener Formatierung: Überschriften in eigener Größe
  mit der Ebene am Rand, Zitate, Listen, Aufgabenkästchen, Code, Trennlinien
  und Auszeichnungen im Fließtext — wobei die Zeichen in der Cursorzeile
  wieder sichtbar werden.
- Variablen in einem eigenen Bereich außerhalb der Schreibfläche,
  schreibgeschützt, bis die Autorin es anders sagt.
- Zeilennummern, Zoom, Umbruch je Blatt und eine Statusleiste mit der
  Cursorposition.
- Suchen im offenen Blatt, geöffnet aus dem nativen Menü.
- Schriftfamilie, Grundgröße und die Verhältnisse der Überschriften als
  Einstellungen.

### Struktur, Suche und Navigation

- Die Gliederung des offenen Blattes, mit H3–H6 zum Wegklappen.
- Suche über die ganze Bibliothek als dritte Ansicht des Navigators —
  ausdrücklich nur der Text, nicht die Variablen.
- Zurück und vorwärts durch die geöffneten Blätter, aus einem eigenen Menü mit
  eigenen Kürzeln, und die zehn zuletzt gespeicherten Blätter.

### Versionsverwaltung

Gegen das Git-Repository des Projekts, ohne Verstecktes: Status, Vormerken,
Zurücknehmen, Commit, Push, Abrufen, Pull, Zusammenführen mit
Konfliktauflösung je Region, Branches, Veröffentlichen eines Branches,
Ersetzen des letzten Commits, Bearbeiten der `.gitignore` und Verwerfen.
Änderungen erscheinen als **Prosa-Vergleich** — Wort für Wort, mit Gits
eigener Zeilenansicht einen Klick daneben. Ein verstecktes Auschecken oder
Umschreiben der Geschichte gibt es bewusst nicht.

### Export

- Eine Markdown-Datei oder ein PDF, das die Anwendung selbst aus HTML und
  einem Druck-Stylesheet setzt.
- Das ganze Dokument oder ab einem Blatt — wobei die Gruppen über diesem Blatt
  mitkommen, damit ein Auszug seinen Ort im Buch behält.
- Gruppen werden Überschriften; die Blätter darunter rücken eine Ebene tiefer.
- Vier mitgelieferte Stylesheets, dazu eigene durch Duplizieren. Eigene
  Stylesheets liegen im Projekt und reisen mit ihm.
- Variablen erscheinen in keinem Export.

### Oberfläche

- Deutsch und Englisch, in der Arbeitsfläche und im nativen Menü, ohne
  Neustart umschaltbar.
- Helles und dunkles Schema, acht Akzentpaletten und eine mitgelieferte statt
  einer vom System geborgten Schrift.
- Vier Regionen als Flächen auf einer Leinwand, mit ziehbaren Trennern, die
  gemerkt werden.
- Jede Handlung ohne Zeigegerät erreichbar.

## Noch nicht gebaut

Diese Dinge sind spezifiziert und bewusst abwesend, nicht vergessen:

- **Import** eines Markdown-Ordners in ein bestehendes Projekt. Einen Ordner
  als *neues* Projekt zu übernehmen funktioniert heute; Texte in ein
  bestehendes zu holen nicht.
- **Der KI-Assistent.** Seine Regeln sind im Einzelnen entschieden — der
  Schlüssel im Schlüsselbund des Systems, der projektweite Umfang je Anfrage
  bestätigt, das Ausgehende vorher gezeigt, und die klare Regel, dass er
  **ohne Verbindung nicht verfügbar ist und das sagt**, während alles andere
  weiterarbeitet. Nichts davon ist umgesetzt.
- **Schnappschüsse.** Entschieden als Commits, über dem Prosa-Vergleich, den
  die Versionsverwaltung schon hat.
- **DOCX- und EPUB-Export**, in dieser Reihenfolge, über dem vorhandenen
  Zusammenbau.
- **Gespeicherte Ansichten**, das eigene Kontextmenü des Editors, das Hervorheben
  besonderer Dateien, das Öffnen mit einer externen Anwendung, ein
  Terminalbereich und das Vorlesen.

## Stand der nativen Plattformen

**Auf keinem Wirtssystem wurde bisher ein natives Paket gebaut.**
`desktop:package` und `desktop:make` sind eingerichtet und wurden nicht
ausgeführt. Entwicklung und Prüfung fanden bisher ausschließlich auf macOS
arm64 statt.

Das ist die größte Lücke zwischen dieser Beta und einer Binärveröffentlichung,
und sie steht unverblümt in der [Plattformmatrix](platforms.md), statt
beschönigt zu werden. Was eine Paketierungsrunde zu klären hat — die Abfolge
je Wirtssystem, die Signierung, die Besitzverhältnisse der Linux-Sandbox und
das Verzeichnis der Artefakte — ist dort im Voraus festgehalten, damit der
erste Lauf einem Plan folgt, statt einen zu entdecken.

## Barrierefreiheit

Das Ziel ist als Regel formuliert, nicht als Norm: **Jede Handlung ist ohne
Zeigegerät erreichbar, jedes fokussierte Element ist sichtbar fokussiert, und
jedes Bedienelement sagt, was es ist.** Diese Regel ist prüfbar und wird
geprüft.

Eine formale Konformitätsaussage nach WCAG 2.1 AA wird bewusst **nicht**
gemacht. Sie ist eine Zusage über Kontrastverhältnisse und
Screenreader-Semantik, die nur mit Tests dahinter ehrlich ist, und diese Tests
sind ein eigener Arbeitsstrang. Das formale Ziel bleibt offen, und nichts
bisher Gebautes arbeitet dagegen.

## Offene Arbeit vor einer signierten Binärveröffentlichung

- Die Paketierungsrunde auf macOS, Windows und einem Linux der Debian-Familie
  durchführen und die Nachweise je Wirtssystem festhalten.
- Signierung und Beglaubigung mit einer Apple Developer ID einrichten und
  prüfen.
- Die Herausgebersignatur für Windows einrichten und prüfen.
- Nur Artefakte veröffentlichen, die aus dem vollständigen, wirtsspezifischen
  Freigabeprüfstand stammen.

## Quellen zum Stand

- [Versionshinweise](releases/0.1.0-beta.1.md) — was in der aktuellen Marke
  steckt.
- [Plattformmatrix](platforms.md) — native Nachweise, einschließlich ihres
  Fehlens.
- [testing](../engineering/testing.md) — welche Nachweise eine Aussage braucht.
- [Roadmap](../engineering/roadmap.md) — offene Arbeit und vertagte
  Entscheidungen.
- [Spezifikation](../engineering/specification.md) — maßgeblich für das
  Produktverhalten.
