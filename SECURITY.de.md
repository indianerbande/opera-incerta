# Sicherheitsrichtlinie

[English](SECURITY.md) | **Deutsch**

## Unterstützter Stand

Opera Incerta ist Beta-Software. Sicherheitskorrekturen erfolgen gegen den
aktuellen Stand auf `main`; ältere Commits und selbst gebaute Artefakte
erhalten keine eigene Wartungszusage. Öffentlich verteilte, signierte
Binärdateien gibt es noch nicht.

## Eine Schwachstelle melden

Legen Sie eine vermutete Schwachstelle nicht in einem öffentlichen Issue
offen. Verwenden Sie das vertrauliche Meldeformular von GitHub für dieses
Repository:

https://github.com/indianerbande/opera-incerta/security/advisories/new

Nennen Sie den betroffenen Build — die Zeile am Fuß des Startfensters oder in
der Fußleiste der Einstellungen, oder den Commit, aus dem Sie gebaut haben —,
das Betriebssystem, die Schritte zur Reproduktion und die erwartete Auswirkung. Entfernen Sie Manuskriptinhalte,
Zugangsdaten, persönliche Pfade und andere vertrauliche Daten aus der Meldung,
sofern sie zur Reproduktion nicht zwingend nötig sind — und wenn ein
Manuskript zwingend nötig ist, kürzen Sie es auf den kleinsten Text, der das
Verhalten noch zeigt.

Die Betreuer bestätigen eine brauchbare Meldung, untersuchen sie und stimmen
die Offenlegung nach Schwere und vorliegenden Nachweisen ab. Da das Projekt
vor der Veröffentlichung steht, wird keine feste Antwort- oder Behebungsfrist
zugesagt.

## Wo das Risiko dieser Anwendung tatsächlich liegt

Dies ist ein lokales Werkzeug: Es braucht kein Netz, kein Konto und keinen
Dienst. Seine Angriffsfläche ist die Grenze zwischen einem Renderer in der
Sandbox und einem Hauptprozess, der die Platte berühren darf. Besonders
nützlich sind Meldungen zu:

- **Der Preload-Brücke und ihren Wächtern.** Jede Anfrage wird im
  Hauptprozess geprüft, und der Renderer bekommt undurchsichtige Griffe statt
  Dateipfaden. Ein Weg, den Hauptprozess auf einen vom Renderer gewählten Pfad
  handeln zu lassen, ist ein echter Fund.
- **Der Eingrenzung.** Ein Pfad, der das geöffnete Projekt verlässt — über
  `..`, einen Symlink, einen kodierten Trenner oder einen gefälschten oder
  wiederverwendeten Griff.
- **Dem eigenen Protokoll des Renderers.** Die Anwendung liefert ihre
  Oberfläche über ein eigenes Schema statt über `file://`, gerade damit eine
  relative Anfrage nicht über die Platte laufen kann.
- **Dem Export.** Ein exportiertes Dokument trägt den Text der Autorin und
  darf nichts ausführen können: Der Parser maskiert Markup, und die eigene
  Content-Security-Policy des Dokuments erlaubt nur dessen Stil. Ein Weg an
  einem von beiden vorbei ist ein Fund.
- **Git als Unterprozess** und dem, was seine Argumente erreichen kann.
- **Dem, was ein Manuskript der Anwendung antun kann.** Eine `.md`-Datei ist
  nicht vertrauenswürdige Eingabe: Variablen, Konfliktmarkierungen, riesige
  Dateien und ungewöhnliche Kodierungen gehören einer Autorin, nicht uns.

## Was hier keine Schwachstelle ist

Die Anwendung liest und schreibt bewusst die Dateien im Projektverzeichnis,
das Sie geöffnet haben — das ist ihr Zweck. Ebenso bewusst: Sie schirmt das
Manuskript nicht gegen Sie ab, und ein Projekt, das Sie öffnen, ist ein
Projekt, dem Sie vertrauen.
