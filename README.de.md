# Opera Incerta

[English](README.md) | **Deutsch**

Opera Incerta ist ein lokales Schreibtischwerkzeug zum Sammeln und Schreiben
von Texten — und um daraus ein strukturiertes Buchmanuskript wachsen zu
lassen.

Es ist bewusst mehr als ein Markdown-Editor: Es begleitet den ganzen Weg vom
ersten gesammelten Gedanken bis zum fertigen Manuskript. Ihre Texte bleiben
echte Markdown-Dateien auf Ihrer eigenen Platte — ein Text ist eine Datei —
und jede Anzeige- und Bearbeitungsentscheidung wird an **Überblick** und
**praktischer Bedienbarkeit** gemessen.

**Aktuelle Veröffentlichung: `v0.1.0-beta.1` — öffentliche Quell-Beta.** Das
ist arbeitende Software, kein frühes Gerüst: Bibliothek, Editor,
Variablenbereich, Versionsverwaltung, Suche, Navigation und Export sind gebaut
und werden von einer automatischen Prüfung Ende zu Ende durch die echte
Anwendung getrieben. Beta heißt: Es gibt noch keine signierten Installer, die
native Paketierung wurde auf Windows und Linux noch nicht durchgeführt, und
einige benannte Teile des Produkts — Import, Assistent, Schnappschüsse — sind
spezifiziert, aber nicht gebaut. Der [Projektstatus](docs/de/project-status.md)
nennt den genauen Reifegrad und die verbleibenden Grenzen.

## Die Arbeitsfläche

![Die Arbeitsfläche von Opera Incerta: Projektbaum, Blattliste, Editor mit formatiertem Markdown und der Inspektor](docs/assets/opera-incerta-workbench.png)

Vier Regionen auf einer Fläche: der Projektbaum, die Blätter der gewählten
Gruppe, der Editor und eine zweite Seitenleiste mit Inspektor oder Gliederung.
Der Screenshot stammt aus der automatischen Schreibtischprüfung, aus der echt
laufenden Anwendung.

## Für wen Opera Incerta ist

- Autorinnen und Autoren, die etwas schreiben, das lang genug ist, um Struktur
  zu brauchen — ein Buch, eine Abschlussarbeit, einen Bericht — und die diese
  Struktur sehen wollen, ohne den Text zu verlassen.
- Schreibende, die ihr Manuskript nicht in einen proprietären Container legen
  wollen und jede Datei von jedem anderen Editor lesbar halten möchten, heute
  und in zehn Jahren.
- Alle, die ein Manuskript in Git führen und wollen, dass das Werkzeug damit
  arbeitet statt darum herum.

## Leitgedanken

Diese sind normativ, nicht wohlmeinend. Jeder einzelne steht in der
Spezifikation und wird vom Prüfstand geprüft.

- **Die Dateien der Autorin gehören der Autorin.** Texte sind echte
  Markdown-Dateien (`.md`, UTF-8) im Dateisystem. Ein Text ist eine Datei —
  ein *Blatt*. Keine Datenbank, kein proprietärer Container. Jede andere
  Markdown-Anwendung kann sie verlustfrei lesen.
- **Metadaten bleiben bei ihrem Inhalt.** Titel, Thema, Schlagwörter, Status,
  Kategorie und Notizen stehen als YAML-Variablen im Kopf derselben Datei, nie
  in einer Begleitdatei. Eine Datei im Finder zu verschieben kann ihre
  Metadaten nicht verwaisen lassen.
- **Die Ordnerstruktur *ist* die Bibliothek.** Gruppen sind Verzeichnisse,
  Blätter sind Dateien. Was Sie im Dateimanager sehen, zeigt die Anwendung.
- **Standard-Markdown auf der Platte, angenehme Darstellung im Editor.** Eine
  Überschrift erscheint als Größe, nicht als `#`; die Datei auf der Platte
  bleibt standardkonform.
- **Speichern verwirft nie etwas.** Von anderen Werkzeugen geschriebene
  Variablen überleben einen Lade- und Speicherdurchlauf Byte für Byte.
- **Umbenennen ändert einen Titel, nie einen Dateinamen.** Die Datei behält
  die Identität, mit der sie angelegt wurde — das hält die Geschichte eines
  Manuskripts lesbar.
- **Der Normalbetrieb braucht kein Netz.** Kein Konto, keine Cloud, kein
  Dienst. Die eine benannte Ausnahme ist der KI-Assistent, der noch nicht
  gebaut ist und das auch sagt.

## Die Quell-Beta ausprobieren

Benötigt Node.js 24.15.0 oder eine neuere 24.x-Ausgabe und die in
`package.json` festgelegte pnpm-Version:

```shell
git clone https://github.com/indianerbande/opera-incerta.git
cd opera-incerta
corepack enable
corepack prepare pnpm@11.24.0 --activate
pnpm install --frozen-lockfile
pnpm run desktop:start
```

Die Anwendung öffnet ihren Starter. Legen Sie ein Projekt an, oder zeigen Sie
auf einen Ordner mit Markdown-Dateien, den Sie schon haben — die Anwendung
bietet an, ihn als Projekt zu übernehmen, ohne etwas zu verschieben oder
umzuschreiben. Die vollständige Bau- und Prüfanleitung steht in [Aus dem
Quellcode bauen](docs/de/build-from-source.md).

## Was Opera Incerta kann

- Zeigt das Manuskript als **Projektbaum, Blattliste und Editor**, mit
  Inspektor und Gliederung in einer zweiten Seitenleiste.
- Bearbeitet Markdown mit **gezeigter statt ausgeschriebener Formatierung**:
  Überschriften in eigener Größe mit der Ebene am Rand, Zitate, Listen,
  Aufgabenkästchen, Code, Trennlinien und Auszeichnungen im Fließtext — wobei
  die Zeichen in der Zeile, in der der Cursor steht, wieder sichtbar werden.
- Hält **Variablen aus der Schreibfläche heraus**, in einem eigenen Bereich,
  der schreibgeschützt ist, bis Sie es anders sagen.
- Legt an, benennt um, ordnet per Ziehen um und löscht in den Papierkorb des
  Systems — **ohne je eine Datei umzubenennen**.
- Vergibt **Seitenkategorien** mit Farben, je Projekt definiert.
- Beobachtet das Projekt: Eine hinter dem Rücken der Anwendung geänderte Datei
  erreicht den Editor, und eine Änderung unter ungespeicherter Arbeit
  **fragt, bevor etwas verloren geht**.
- Bietet **Versionsverwaltung** gegen das Git-Repository des Projekts: Status,
  Vormerken, Zurücknehmen, Commit, Push, Abrufen, Pull, Zusammenführen mit
  Konfliktauflösung je Region, Branches, Ersetzen des letzten Commits und
  `.gitignore` — mit einer Prosa-Ansicht, die Wort für Wort zeigt, was sich
  geändert hat.
- **Findet** im offenen Blatt und durchsucht die ganze Bibliothek.
- Merkt sich, **wo Sie waren**: zurück und vorwärts durch die geöffneten
  Blätter, und die zehn zuletzt gespeicherten.
- **Exportiert** das Manuskript als eine Markdown-Datei oder als PDF, das die
  Anwendung selbst setzt — ganz oder ab einem Blatt, mit vier mitgelieferten
  Stylesheets oder einem, das Sie dupliziert und geändert haben.
- Spricht **Deutsch und Englisch**, in der Arbeitsfläche und im nativen Menü.
- Bietet **helles und dunkles Schema** und acht Akzentpaletten, mit
  mitgelieferter statt vom System geborgter Schrift.
- Ist **ohne Zeigegerät erreichbar**: Jede Handlung hat einen Menüeintrag oder
  ein Tastenkürzel.

## Wie es gebaut ist

Eine Electron-Hülle besitzt jeden Zugriff auf Dateisystem, Prozesse und Git.
Der Angular-Renderer läuft in der Sandbox, mit Kontextisolierung und ohne
Node-Integration, und bekommt **undurchsichtige Griffe** statt Pfaden, mit
denen er handeln könnte. Dazwischen liegt eine versionierte Brücke, deren jede
Anfrage im Hauptprozess geprüft wird — ein Typ zur Übersetzungszeit ist keine
Prüfung.

Die Regeln, die das Verhalten entscheiden, liegen in einem portablen Kern ohne
DOM, ohne Electron und ohne Node-Schnittstellen. So werden sie ohne Fenster
geprüft und liefern überall dasselbe Ergebnis. Die Editor-Komponente sitzt
hinter einem Port mit eigener Vertragsprüfung, die gegen die echte Komponente
und gegen ein Speicher-Double läuft.

```text
Markdown-Dateien auf der Platte
  -> Projekt-Adapter (der einzige Code, der ein Dateisystem berührt)
  -> versionierte Brücke mit Laufzeitwächtern
  -> Regionen der Arbeitsfläche
  -> Anzeigemodell des Editors
  -> dasselbe Standard-Markdown, zurück auf der Platte
```

## Vibe Coding mit fachlicher Verantwortung

**Opera Incerta wurde vibe-codiert — absichtlich, offen und unter erfahrener
menschlicher fachlicher Leitung.** Dialogische KI hat Umsetzung, Erkundung,
Umbau, Tests und Dokumentation beschleunigt. Sie hat weder die Architektur
besessen noch die für eine Änderung geforderten Nachweise gesenkt.

Dieser Weg taugt nur, wenn die leitende Person das System entwerfen,
erzeugten Code verstehen und ablehnen, die Folgen für Sicherheit und Wartung
beurteilen und erkennen kann, wo eine automatische Prüfung nicht ausreicht.
Die Spezifikation, der Quellcode, die Prüfstände und die Nachweise in diesem
Repository bleiben maßgeblich. [Vibe Coding mit fachlicher
Verantwortung](docs/de/ki-gestuetzte-entwicklung.md) nennt Nutzen, Grenzen und
die Arbeitsregeln hinter diesem Satz.

## Die Beta prüfen

Nach der Installation der Abhängigkeiten führt ein Befehl den vollständigen
Quellprüfstand aus:

```shell
pnpm run check
```

Er baut jedes Paket, prüft die Typen des Testcodes, führt jede Prüfsammlung
aus, verifiziert die Grenze der paketierten Anwendung, kontrolliert die per
Hash festgelegten Medien und validiert diese Dokumentation. Zwei weitere
Prüfstände treiben echte Software:

```shell
pnpm run desktop:smoke
pnpm run spike:editor
```

`desktop:smoke` startet die echte Hülle und treibt den echten Renderer mit
echten Eingabeereignissen — und liest die Ergebnisse von der Platte und aus
Git statt aus der Überzeugung der Anwendung. Was jeder Prüfstand belegt, steht
in [testing](docs/engineering/testing.md) (Englisch).

## Grenzen dieser Beta

Was gebaut ist, ist ordentlich gebaut; was fehlt, wird benannt statt
angedeutet.

- **Keine signierten Installer.** Die Beta wird als Quellcode verteilt. Die
  native Paketierung ist vorbereitet, aber **auf keinem Wirtssystem
  durchgeführt** — die [Plattformmatrix](docs/de/platforms.md) hält das
  ehrlich fest, statt eine Abdeckung zu behaupten, die es nicht gibt.
- **Import, KI-Assistent und Schnappschüsse sind spezifiziert, aber nicht
  gebaut.** Der Assistent wird seiner Natur nach eine Netzverbindung
  brauchen und sagen, wenn keine da ist; nichts anderes in der Anwendung
  wird eine Netzabhängigkeit bekommen.
- **DOCX- und EPUB-Export** folgen dem heute vorhandenen Markdown und PDF.
- **Barrierefreiheit** ist als Regel formuliert — jede Handlung ohne
  Zeigegerät erreichbar — und wird als solche geprüft. Eine formale
  WCAG-Konformitätsaussage wird bewusst nicht gemacht, weil sie nur mit Tests
  dahinter ehrlich wäre.

Diese und die kleineren Lücken stehen in klaren Worten im
[Projektstatus](docs/de/project-status.md); die technischen Arbeitspunkte
stehen in der [Roadmap](docs/engineering/roadmap.md) (Englisch).

## Dokumentation

Das [deutsche Dokumentationsverzeichnis](docs/de/README.md) ist der beste
Einstieg.

- [Benutzerhandbuch](docs/de/user-guide.md) — was die Anwendung kann und wie
  man damit arbeitet
- [Projektstatus](docs/de/project-status.md) — was diese Beta bedeutet und was
  sie nicht verspricht
- [Aus dem Quellcode bauen](docs/de/build-from-source.md) — klonen, prüfen,
  starten und paketieren
- [Vibe Coding mit fachlicher Verantwortung](docs/de/ki-gestuetzte-entwicklung.md)
- [Native Plattformmatrix](docs/de/platforms.md)
- [Versionshinweise](docs/de/releases/0.1.0-beta.1.md)
- [CONTRIBUTING.de.md](CONTRIBUTING.de.md) — wie man mitwirkt
- [SECURITY.de.md](SECURITY.de.md) — vertrauliche Meldung von Schwachstellen
- [Technische Dokumentation](docs/engineering/README.md) — Spezifikation,
  Testing, Konventionen, Abhängigkeiten und Roadmap (Englisch)

## Aufbau des Repositorys

| Pfad | Inhalt |
| --- | --- |
| `packages/core` | Portable Fachregeln. Kein DOM, kein Electron, keine Node-Schnittstellen. |
| `packages/desktop-contract` | Die versionierte Brücke zwischen Hauptprozess und Renderer samt Laufzeitwächtern. |
| `packages/export` | Export als Modul: Zusammensetzen des Manuskripts, die druckbare Seite, die Stylesheets. |
| `packages/localization` | Die deutschen und englischen Kataloge und die Regeln, die sie lesen. |
| `packages/markdown` | Die Blockstruktur eines Dokuments, mit markdown-it gelesen und in die Typen des Kerns übersetzt. |
| `packages/project-node` | Projekt- und Bibliotheksadapter — besitzt den Dateisystemzugriff. |
| `packages/git-node` | Adapter für die Versionsverwaltung über das `git` des Systems. |
| `apps/workbench` | Angular-Renderer: die Oberfläche der Arbeitsfläche. |
| `apps/desktop` | Electron-Hülle: Lebenszyklus, Fenster, Dialoge, Paketierung. |
| `examples/` | Eigene Beispielprojekte. |
| `docs/` | Öffentliche Dokumentation auf Deutsch und Englisch sowie die technischen Quellen. |

## Eigenständigkeit

Opera Incerta ist eine eigenständige Umsetzung. Ulysses, Scrivener, Obsidian,
Typora, iA Writer und ähnliche Werkzeuge wurden nur über öffentliche
Dokumentation und beobachtbares Verhalten studiert; das Drei-Spalten-Konzept
nimmt Ulysses als Ausgangspunkt und ist ausdrücklich keine Kopie. Kein
fremder Quellcode, keine fremde Grammatik, Dokumentation, Testdaten und keine
fremden Gestaltungsmittel wurden in dieses Projekt übernommen.

## Lizenz

Opera Incerta steht unter der [Apache-Lizenz 2.0](LICENSE). Abhängigkeiten
Dritter behalten ihre eigenen Lizenzen und sind in
[dependencies](docs/engineering/dependencies.md) dokumentiert.
