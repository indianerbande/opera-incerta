# Native Plattformmatrix

[English](../en/platforms.md) | **Deutsch**

Aktualisiert: 2026-09-12 · Veröffentlichung: `v0.1.0-beta.1`

Dieses Dokument hält fest, **was auf welchem Betriebssystem tatsächlich gebaut
und geprüft wurde**. Es ist bewusst ein Protokoll und keine Absichtserklärung:
Ein auf einem Betriebssystem gebautes Artefakt ist nur für dieses
Betriebssystem ein Nachweis.

## Der Stand, unverblümt

| Plattform | Quellprüfstand | Schreibtischprüfung | Natives Paket | Installiert und durchgespielt |
| --- | --- | --- | --- | --- |
| macOS arm64 | grün | grün | **nicht gelaufen** | **nicht erfolgt** |
| macOS x64 | nicht gelaufen | nicht gelaufen | **nicht gelaufen** | **nicht erfolgt** |
| Windows x64 | nicht gelaufen | nicht gelaufen | **nicht gelaufen** | **nicht erfolgt** |
| Ubuntu 24.04 x64 | grün (CI) | grün (CI, 45 Prüfungen) | **nicht gelaufen** | **nicht erfolgt** |
| Ubuntu / Debian arm64 | nicht gelaufen | nicht gelaufen | **nicht gelaufen** | **nicht erfolgt** |

**Für keine Plattform existiert ein natives Paket.** `pnpm run desktop:package`
und `pnpm run desktop:make` sind über Electron Forge eingerichtet und wurden
nie ausgeführt.

Die Ubuntu-Zeile ist aus der **kontinuierlichen Integration** gefüllt
(2026-09-12), nicht von einem Menschen an einer Maschine: Der Quellprüfstand
und alle 45 Schreibtischprüfungen laufen auf `ubuntu-24.04` aus einem sauberen
Checkout durch. Das ist ein echter Nachweis für den Quellbau und für das
Verhalten der Anwendung unter X11 — und kein Nachweis für ein Paket, eine
Installation oder den Durchgang von Hand weiter unten. Diese Unterscheidung
wird gehalten, denn sie ist der ganze Sinn dieser Tabelle.

Der erste Lauf hat sich gelohnt: Er fand zwei macOS-Annahmen, die wochenlang
grün gewesen waren — einen hart kodierten `cmd`-Modifier in der
Schreibtischprüfung und eine Export-Zusicherung, die einen Schriftnamen las,
den nur ein Mac sicher hat.

Das ist der ehrliche Stand einer Quell-Beta und der Grund, warum diese Beta
als Quellcode statt als Download verteilt wird.

## Warum ein Wirtssystem nicht für ein anderes bürgen kann

Die Anwendung bringt eine Chromium-Laufzeit mit und benutzt die Dateidialoge,
Menüs, den Papierkorb und das `git` der jeweiligen Plattform. Jedes davon
unterscheidet sich je Betriebssystem auf eine Weise, die eine Prüfung auf
einem anderen Wirtssystem nicht beobachten kann:

- native Hilfsprogramme des Paketbauers werden für Laufzeit und Architektur
  des Wirtssystems übersetzt;
- Chromiums Sandbox braucht auf jedem System andere Rechte;
- Pfadsemantik, Groß-/Kleinschreibung und Zeilenenden unterscheiden sich;
- und Papierkorb, Speicherdialog und Menü gehören der Plattform, nicht uns.

Deshalb hat die Matrix eine Zeile je Plattform **und** Architektur, und eine
Zeile füllt nur aus, wer die Abfolge auf dieser Maschine ausgeführt hat.

## Die Abfolge, die jedes Wirtssystem durchlaufen muss

Ein sauberer Checkout je Wirtssystem. Übersetzung für eine fremde Plattform
wird nicht behauptet.

```shell
node --version          # muss 24.15.0 oder eine neuere 24.x sein
pnpm --version          # muss 11.24.0 sein
pnpm install --frozen-lockfile
pnpm run check
pnpm run desktop:smoke
pnpm run desktop:make
```

Danach das Artefakt prüfen und ein Verzeichnis aus Dateiname, Größe und
SHA-256 je Plattform und Architektur als Nachweis schreiben.

**Mit der Lockfile unter dem festgelegten Node 24 installieren, *bevor* der
Freigabeprüfstand läuft.** Native Hilfsprogramme, die unter einer anderen
Laufzeit übersetzt wurden, erzeugen eine ABI-Unverträglichkeit, die erst beim
Paketieren auftaucht — lange nachdem der Quellprüfstand grün war.

Die Electron-Laufzeit kommt über das `postinstall` der Wurzel, das den Befehl
`install-electron` des Schreibtischpakets ausführt. Eine Installation mit
`--ignore-scripts` lässt sie aus; dann anschließend:

```shell
pnpm --filter @opera-incerta/desktop exec install-electron
```

## Anforderungen je Plattform

### macOS

Erzeugt eine `.app` sowie DMG und ZIP. Entwicklungsbauten sind **nur ad-hoc
signiert**: Sie laufen auf der Maschine, die sie gebaut hat, und sind nicht
verteilbar. Eine öffentliche Veröffentlichung braucht Signierung und
Beglaubigung mit einer Apple Developer ID; beides ist noch nicht eingerichtet.
Das Erzeugen eines DMG kann die Xcode-Kommandozeilenwerkzeuge brauchen.

### Windows

Erzeugt ein Anwendungsverzeichnis und einen Squirrel-Installer. Aus nativem
PowerShell oder der Eingabeaufforderung bauen, **nie aus WSL** — ein
WSL-Bau erzeugt Linux-Binärdateien mit Windows-Pfaden und scheitert auf eine
Weise, die einen Nachmittag kostet.

Node 24 gehört in ein entpacktes ZIP, das über den vollen Pfad aufgerufen
wird. Die MSI-Installer verschiedener Hauptversionen ersetzen einander und
taugen nicht als nebeneinander laufende Baulaufzeit.

Ein öffentlicher Installer braucht eine Herausgebersignatur, die noch nicht
eingerichtet ist.

### Debian und Ubuntu

Erzeugt ein DEB, bewusst statt eines portablen Archivs. Chromiums
Sandbox-Hilfsprogramm muss `root:root` gehören und den Modus `4755` tragen,
und nur ein Paketmanager kann das auf Systemen herstellen, die unprivilegierte
Benutzernamensräume einschränken.

**Die Sandbox wird nie abgeschaltet**, und niemand wird gebeten,
Anwendungsdateien von Hand zu reparieren. Das Bau-Wirtssystem braucht `sudo`,
`dpkg` und `fakeroot`.

Dieselbe Anforderung beißt in der kontinuierlichen Integration, wo Electron
aus einer npm-Installation statt von einem Paketmanager kommt: Der Workflow
verschafft dem Hilfsprogramm diese Besitzverhältnisse selbst, bevor er die
Schreibtischprüfung fährt. Er übergibt **nicht** `--no-sandbox` — dann liefe
die Prüfung unter Bedingungen, welche die ausgelieferte Anwendung nie hat.

## Der Durchgang von Hand nach der Installation

Automatische Prüfungen enden dort, wo der Installer beginnt. Auf einer
Maschine **ohne installiertes Node** muss jedes Wirtssystem zusätzlich:

1. das Paket installieren;
2. die Anwendung starten;
3. ein Projekt anlegen, schreiben, speichern, schließen und wieder öffnen;
4. ein PDF und eine Markdown-Datei exportieren;
5. die Versionsverwaltung gegen ein echtes Repository durchspielen;
6. **die Netzverbindung trennen** und bestätigen, dass alles weiterarbeitet;
7. deinstallieren und bestätigen, dass keine Projektdaten mitgenommen wurden.

Schritt 6 ist keine Formalität: „Der Normalbetrieb braucht kein Netz" ist eine
erklärte Invariante dieser Anwendung, und ein installierter Bau ist der Ort,
an dem sich das beweisen statt annehmen lässt.

## Was danach in die Matrix kommt

Je Plattform und Architektur: die Version des Wirtsbetriebssystems, die
Versionen von Node und pnpm, die Artefaktnamen mit Größe und SHA-256, das
Datum und welche der sieben Schritte von Hand bestanden wurden. Eine Zeile mit
einem fehlenden Schritt wird als fehlend geschrieben, nicht als bestanden.
