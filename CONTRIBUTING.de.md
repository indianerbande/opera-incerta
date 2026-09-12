# Zu Opera Incerta beitragen

[English](CONTRIBUTING.md) | **Deutsch**

Danke, dass Sie helfen, Opera Incerta zu verbessern. Das Projekt ist eine
öffentliche Quell-Beta: Was gebaut ist, ist echt und wird Ende zu Ende
geprüft, aber es gibt noch keine signierten Installer, und mehrere
spezifizierte Fähigkeiten sind nicht gebaut. Der
[Projektstatus](docs/de/project-status.md) nennt den Reifegrad und die
Grenzen.

## Vorher

Öffnen Sie ein Issue, bevor Sie Arbeit in eine größere Änderung an Produkt,
Architektur, Abhängigkeiten oder Oberfläche stecken.
[`docs/engineering/specification.md`](docs/engineering/specification.md)
legt das angenommene Produktverhalten fest;
[`docs/engineering/testing.md`](docs/engineering/testing.md) legt fest, welche
Nachweise eine Änderung braucht. Beide Dokumente sind auf Englisch — sie sind
die maßgeblichen technischen Quellen und werden bewusst nicht übersetzt, damit
ein Vertrag nicht zwischen zwei Fassungen auseinanderlaufen kann.

**Erst spezifizieren, dann bauen.** Dieses Projekt schreibt die Regel auf,
bevor es den Code schreibt: Eine Änderung, die Verhalten ändert, ändert die
Spezifikation in derselben Änderung, nie später. Steht eine Anforderung nicht
in der Spezifikation, dann gibt es sie noch nicht — entscheiden, festhalten,
dann bauen.

Opera Incerta muss ein eigenständiges Programm bleiben. Beschreiben Sie andere
Schreibwerkzeuge über allgemeine Fähigkeiten oder Grenzen. Übernehmen Sie
weder deren Code noch Dokumentation, Beispiele, Testdaten, Symbole oder
Oberflächenaufteilungen.

## Entwicklungsumgebung

Verwenden Sie Node.js 24.15.0 oder eine neuere 24.x-Ausgabe und pnpm 11.24.0.
[Aus dem Quellcode bauen](docs/de/build-from-source.md) beschreibt einen
sauberen Checkout und Bau. Vor einem Pull Request:

```shell
pnpm install --frozen-lockfile
pnpm run check
pnpm run desktop:smoke
git diff --check
```

Änderungen am Anzeigemodell des Editors verlangen zusätzlich
`pnpm run spike:editor`, was den Adaptervertrag in einer echten
Rendering-Maschine ausführt. Die fortlaufende Integration führt ihn ebenfalls
aus, sodass ein Pull Request, der CodeMirror bewegt, ohne ihn nicht grün
werden kann. Änderungen am visuellen System verlangen, die
Screenshots **anzusehen**, welche die Schreibtischprüfung nach
`build/desktop/` schreibt — keine Zusicherung sagt Ihnen, dass eine Zeile über
fünfundneunzig Zeichen lief.

## Was als Nachweis zählt

Zwei Regeln wiegen schwerer als der Rest, und ein Pull Request, der sie
übergeht, wird zurückgeschickt:

1. **Jede neue Prüfung muss falsifiziert werden.** Machen Sie das Verhalten
   absichtlich kaputt, sehen Sie die Prüfung rot werden, und vergewissern Sie
   sich, dass sie aus dem *richtigen Grund* rot wurde. Eine Prüfung, die nicht
   fehlschlagen kann, ist schlechter als keine: Sie sagt der nächsten
   Leserin, der Fall sei dort behandelt, wo er es nicht ist.
2. **Eine Regel, die eine reine Funktion sein kann, ist eine reine Funktion.**
   Sie lebt in `packages/core`, wird dort ohne Fenster geprüft und wird nicht
   in einer Komponente noch einmal umgesetzt.

## Pull Requests

Halten Sie jeden Pull Request bei einer Sache, und erklären Sie:

- das sichtbare Problem oder die architektonische Grenze;
- was die Spezifikation nach Ihrer Änderung dazu sagt;
- die Umsetzung und ihre Auswirkung auf die Adapter;
- die automatischen Nachweise und die Falsifikation jeder neuen Prüfung;
- was Sie bewusst nicht getan haben.

Committen Sie keine Bauergebnisse, Zugangsdaten, privaten Manuskriptinhalte
oder lokalen Pfade. Änderungen an Abhängigkeiten folgen dem Prüfweg in
[`docs/engineering/dependencies.md`](docs/engineering/dependencies.md); ein
automatischer Aktualisierungs-Pull-Request wird nie allein deshalb
übernommen, weil seine Versionsnummer höher ist.

## Arbeitsdokumente

- [`docs/engineering/roadmap.md`](docs/engineering/roadmap.md) enthält **nur
  Offenes**. Fertige Arbeit zieht vollständig aus.
- [`docs/engineering/completed-work.md`](docs/engineering/completed-work.md)
  hält fest, was gebaut wurde, warum auf diese Weise, wie es geprüft wurde und
  was es gelehrt hat — einschließlich der Fehler. Der letzte Teil ist keine
  Zierde: So vermeidet das Projekt, einen Fehler zweimal zu machen.

## Beiträge mit KI-Unterstützung

Beiträge mit KI-Unterstützung sind willkommen — dieses Projekt ist so gebaut
worden und sagt das offen. Die beitragende Person bleibt verantwortlich dafür,
den eingereichten Code zu verstehen, die Grenzen von Architektur und
Eigenständigkeit zu wahren, den vollständigen Diff zu prüfen und dieselben
Nachweise zu liefern wie für von Hand geschriebenen Code. Siehe [Vibe Coding
mit fachlicher Verantwortung](docs/de/ki-gestuetzte-entwicklung.md).

Mit dem Einreichen eines Beitrags zur Aufnahme erklären Sie sich damit
einverstanden, dass er unter der Apache-Lizenz 2.0 dieses Repositorys und
deren Beitragsbedingungen lizenziert wird.
