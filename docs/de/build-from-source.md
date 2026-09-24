# Opera Incerta aus dem Quellcode bauen

[English](../en/build-from-source.md) | **Deutsch**

Die Beta wird als Quellcode verteilt. Diese Seite führt von einer sauberen
Maschine zu einer laufenden Anwendung — und dann zu einer geprüften.

## Voraussetzungen

- **Node.js 24.15.0** oder eine neuere 24.x-Ausgabe. Das Repository legt die
  Linie in `package.json` und `.node-version` fest.
- **pnpm 11.24.0**, separat unter Node 24 installiert.
- **Git**, zum Klonen und weil die Versionsverwaltung der Anwendung das `git`
  des Systems aufruft.
- Etwa 1,5 GB Plattenplatz für Abhängigkeiten und die Electron-Laufzeit.

Um die Anwendung aus dem Quellcode zu starten, braucht es keine
Übersetzerwerkzeuge, kein Python und keine native Bauumgebung. Sie nativ zu
paketieren braucht mehr; siehe die [Plattformmatrix](platforms.md).

## Laufzeit nach Betriebssystem auswählen

- **Windows / PowerShell:** Node 24 als ZIP entpacken und für diese Sitzung
  auswählen: `$env:PATH = "C:\tools\node-v24.15.0-win-x64;$env:PATH"`.
  Den Beispielpfad durch den tatsächlichen Entpackpfad ersetzen. Nicht in WSL bauen.
- **macOS / Homebrew:** `export PATH="/opt/homebrew/opt/node@24/bin:$PATH"`
  auf Apple Silicon; bei anderer Installation deren tatsächlichen Pfad verwenden.
- **Linux:** Node 24 über die vorhandene Laufzeitverwaltung auswählen.
  Desktop-Prüfungen benötigen eine Anzeige (in CI Xvfb) und eine funktionsfähige
  Chromium-Sandbox; siehe [Plattformmatrix](platforms.md).

Danach `node --version` (24.x) und `pnpm --version` (11.24.0) prüfen.
`.node-version` allein schaltet die Laufzeit nicht um.

## Klonen und installieren

```shell
git clone https://github.com/indianerbande/opera-incerta.git
cd opera-incerta
npm install --global pnpm@11.24.0
pnpm install --frozen-lockfile
```

`--frozen-lockfile` ist Absicht: Es installiert genau das, was die Lockfile
festhält, und scheitert, statt etwas Neueres aufzulösen.

### Zur Electron-Laufzeit

Die Electron-Binärdatei holt das `postinstall` der Wurzel, das den Befehl
`install-electron` des Schreibtischpakets ausführt. Das veröffentlichte
Electron-Paket hat kein eigenes Installationsskript, deshalb bringt es keine
pnpm-Einstellung herein — der ausdrückliche Befehl ist der Weg. Er ist
idempotent und überspringt, wenn `dist/` schon die richtige Version enthält.

Wer mit `--ignore-scripts` installiert hat, dem fehlt die Laufzeit:

```shell
pnpm --filter @opera-incerta/desktop exec install-electron
```

## Starten

```shell
pnpm run desktop:start
```

Das baut den Renderer sowie die Electron-Bündel für Hauptprozess und Preload
und öffnet die Anwendung auf ihrem Starter. Legen Sie ein Projekt an, oder
zeigen Sie auf einen Ordner mit Markdown-Dateien, den Sie schon haben: Die
Anwendung bietet an, ihn zu übernehmen — das legt ein Verzeichnis
`.opera-incerta/` an und ändert sonst nichts.

Um nur am Renderer zu arbeiten, im Browser und ohne die Hülle:

```shell
pnpm run workbench:start
```

Die Arbeitsfläche läuft dann ohne Brücke und zeigt kein Projekt — nützlich für
Layoutarbeit, nicht für irgendetwas, das eine Datei berührt.

## Prüfen

Ein Befehl führt den vollständigen Quellprüfstand aus:

```shell
pnpm run check
```

Er baut jedes Workspace-Paket, prüft die Typen der Testprojekte, führt jede
Prüfsammlung aus, verifiziert die Grenze der paketierten Anwendung
(festgelegte Abhängigkeiten, Fensteroptionen in der Sandbox, das
Kanalverzeichnis des Preloads, die Content-Security-Policy), kontrolliert die
per Hash festgelegten Symbole und Schriften samt Lizenzen und validiert diese
Dokumentation.

Zwei weitere Prüfstände treiben echte Software statt Module:

```shell
pnpm run desktop:smoke
pnpm run spike:editor
```

`desktop:smoke` startet die echte Electron-Hülle gegen eine Kopie eines
Beispielprojekts und treibt den echten Renderer mit echten Eingabeereignissen
— Klicken, Tippen, Ziehen und das native Menü — und liest die Ergebnisse dann
von der Platte und aus Git statt aus der Überzeugung der Anwendung. Er
schreibt Screenshots nach `build/desktop/`, die anzusehen sich lohnt.

`spike:editor` führt die Vertragsprüfung des Editor-Adapters in einer echten
Rendering-Maschine aus, damit das Anzeigemodell dort bewiesen wird, wo es
tatsächlich läuft.

All das läuft offline. Nichts davon braucht ein Netz.

## Ein natives Paket bauen

```shell
pnpm run desktop:package   # ein Anwendungsverzeichnis
pnpm run desktop:make      # ein verteilbarer Installer oder ein Archiv
```

**Unter Windows x64 am 24.09.2026 erfolgreich: Anwendungsverzeichnis und ZIP.** Lesen Sie vorher die
[Plattformmatrix](platforms.md): Dort stehen die Abfolge je Wirtssystem, die
Voraussetzungen und der Durchgang von Hand danach. Ein Paket muss auf der
Plattform gebaut werden, für die es gedacht ist.

## Ein Quell-ZIP genügt ebenfalls

Der Bau und der vollständige Quellprüfstand brauchen **kein**
`.git`-Verzeichnis, ein heruntergeladenes Quellarchiv baut und prüft sich
also. Git braucht allein die Versionsverwaltung der Anwendung — und die wirkt
auf *Ihr* Projekt, nicht auf dieses Repository.

## Wo die Anwendung was ablegt

- **Ihr Projekt** enthält das Manuskript sowie ein Verzeichnis
  `.opera-incerta/` mit dem Projektsatz, der Gruppenstruktur, den Kategorien,
  der Liste der zuletzt bearbeiteten Blätter und den Export-Stylesheets, die
  Sie angelegt haben. All das gehört in Ihre Versionsverwaltung.
- **Installationslokaler Zustand** — die Liste der zuletzt geöffneten Projekte
  und Ihre Einstellungen — liegt im Benutzerdatenverzeichnis von Electron für
  Ihr Betriebssystem und wird nie in ein Projekt geschrieben.

## Wenn etwas schiefgeht

- **`electron: not found`, oder das Fenster erscheint nie.** Die Laufzeit
  fehlt; führen Sie den obigen `install-electron`-Befehl aus.
- **Die Rauchprüfung hängt.** Sie treibt eine echte Anwendung; wartet ein
  Dialog auf eine Antwort, die nie kommt, bleibt der Lauf stehen. Die
  Konsolenausgabe nennt die Prüfung, in der er war.
- **Ein Test scheitert direkt nach einer Änderung an Abhängigkeiten.** Zuerst
  bauen — mehrere Pakete lösen einander über `dist/` auf, ein alter Bau meldet
  sich also als Typfehler in einer Datei, die Sie nicht angefasst haben:

  ```shell
  pnpm run build
  ```
