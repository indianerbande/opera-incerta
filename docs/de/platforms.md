# Native Plattformmatrix

[English](../en/platforms.md) | **Deutsch**

Aktualisiert: 2026-09-24 · Veröffentlichung: `v0.1.0-beta.1`

Dieses Dokument hält fest, **was auf welchem Betriebssystem tatsächlich gebaut
und geprüft wurde**. Es ist bewusst ein Protokoll und keine Absichtserklärung:
Ein auf einem Betriebssystem gebautes Artefakt ist nur für dieses
Betriebssystem ein Nachweis.

## Nachweise nach Betriebssystem

Die Windows-Ergebnisse enthalten die lokalen Korrekturen vom 24.09.2026,
nicht nur den unveränderten Beta-Tag. macOS und Linux wurden für diese
Korrekturen nicht erneut geprüft.

| Plattform | Datum | Quellcode-Prüfung | Entwicklungs-Smoke | Natives Paket | Installationsabnahme |
| --- | --- | --- | --- | --- | --- |
| Windows 11 x64, Build 26200 | 2026-09-24 | 1119 Tests, Editor 7/7 | 47/47 | Anwendungsverzeichnis und ZIP; ASAR geprüft | offen |
| macOS arm64 | bis 2026-09-14 dokumentiert | grün, historisch | grün, historisch | nicht ausgeführt | offen |
| macOS x64 | — | nicht ausgeführt | nicht ausgeführt | nicht ausgeführt | offen |
| Ubuntu 24.04 x64 | 2026-09-14 | grün, CI | 47/47, CI unter X11 | nicht ausgeführt | offen |
| Ubuntu / Debian arm64 | — | nicht ausgeführt | nicht ausgeführt | nicht ausgeführt | offen |

Windows: Node 24.15.0, pnpm 11.24.0, native PowerShell. Der Desktop-Smoke
startet die Entwicklungsversion, keine Forge-Distribution. Der Paketcheck
prüft dagegen das tatsächliche ASAR: Main/Preload, Buildkennung, Renderer,
Schriften, Icons, Lizenzhinweise und Projektlizenz müssen dem Build entsprechen.
Smoke-Code und unerwartete Dateien sind verboten; die Version muss dem
Workspace entsprechen. Ausgabe: `build/packages/`.

Vier beschädigte Kopien falsifizieren diesen Check: fehlender Renderer,
verändertes Main-Bundle, mitgelieferter Smoke-Code und falsche Version.
Jede scheitert am vorgesehenen Grund; das unveränderte Artefakt besteht.
Die manuelle Installationsabnahme bleibt auf allen Plattformen offen.
Die paketierte Windows-Anwendung wurde mit isoliertem Arbeitsverzeichnis
und Testprojekt gestartet: Renderer, Projektöffnung, Bearbeitung und
Speichern auf die Platte bestanden; der Screenshot wurde angesehen.

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
pnpm run spike:editor
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

### Windows

Nativ in PowerShell oder Eingabeaufforderung bauen, nicht unter WSL.
Node 24 aus einem entpackten ZIP oder vorhandenen Versionsmanager auswählen;
andere Node-Installationen getrennt halten. Bridge-Pfade verwenden `/`,
native Dateipfade die Windows-Schreibweise. Git-Testvorlagen legen ihre
Zeilenendenregel selbst fest, ohne die globale Git-Konfiguration zu ändern.
Der konfigurierte Maker erzeugt ein unsigniertes Entwicklungs-ZIP.
Squirrel-Installer und Herausgebersignatur sind noch offen.

### macOS

Der konfigurierte Maker zielt auf Anwendungsbundle und ZIP. Native Paketierung
wurde hier noch nicht verifiziert. DMG, Developer-ID-Signierung und
Beglaubigung bleiben Verteilungsaufgaben.

### Debian und Ubuntu

CI verwendet eine virtuelle X11-Anzeige und bereitet Electrons Sandbox-Helfer
vor. Die Sandbox wird nie abgeschaltet. Der ZIP-Maker stellt nicht Eigentümer
`root:root` und Modus `4755` her, die Systeme mit eingeschränkten unprivilegierten
Benutzernamensräumen benötigen. Linux-ZIP ist deshalb keine unterstützte
Endnutzerverteilung. DEB-Maker und Installationstests sind offen; diese Runde
benötigt `sudo`, `dpkg` und `fakeroot` auf dem Bauhost.

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
