# Vibe Coding mit fachlicher Verantwortung

[English](../en/ai-assisted-development.md) | **Deutsch**

Status: Erklärung zur Projektentwicklung

Datum: 2026-09-11

**Opera Incerta wurde vibe-codiert.** Wesentliche Teile dieses Projekts
entstanden im Dialog mit einem KI-Agenten: Ziele, Randbedingungen und
Beobachtungen wurden in natürlicher Sprache ausgedrückt; der Agent las das
Repository, schlug Änderungen vor oder setzte sie um, ließ die Prüfstände
laufen und verfeinerte das Ergebnis über Rückmeldung.

Dieser Satz ist keine Entschuldigung und keine Behauptung, Fachwissen sei
entbehrlich geworden. Er beschreibt eine Arbeitsweise, in der erfahrene
menschliche fachliche Leitung und die Umsetzungskraft einer KI einander
verstärken — und er steht offen da, weil eine Leserin wissen darf, wie die
Software vor ihr entstanden ist.

## Was hier mit Vibe Coding gemeint ist

Der Begriff wird auf zwei sehr verschiedene Weisen gebraucht. In seiner engsten
Form meint er, erzeugten Code anzunehmen, ohne seiner Umsetzung viel
Aufmerksamkeit zu schenken. In seiner weiteren, fachlichen Form meint er
dialogische, KI-gestützte Entwicklung, in der ein Mensch das Ergebnis nach wie
vor prüft, testet, versteht und verantwortet.

Dieses Projekt verwendet die zweite Bedeutung und lehnt die erste ausdrücklich
ab. Code wird nicht angenommen, weil er plausibel aussieht, weil er einmal
gelaufen ist oder weil er schnell da war. Das Gespräch beschleunigt die
Umsetzung; es ersetzt keine Softwaretechnik.

## Warum es sich so zu arbeiten lohnte

Für erfahrene Entwicklerinnen und Entwickler bringt diese Arbeitsweise
handfeste Hebelwirkung:

- **Mehr Aufmerksamkeit für Architektur und Absicht.** Die natürliche Sprache
  trägt das gewünschte Verhalten, die Grenzen und die Abwägungen, während die
  mechanische Umsetzung anderswo geschieht.
- **Schnellere ausführbare Rückmeldung.** Eine Idee wird früh genug zu einem
  laufenden Kandidaten, um an ihrem Verhalten beurteilt statt als Möglichkeit
  besprochen zu werden.
- **Billigere Erkundung.** Mehrere Wege lassen sich ausprobieren und
  verwerfen, ehe einer angenommen wird. Die technischen Spikes dieses Projekts
  sind ein Beispiel: Der Editor- und der Parser-Spike maßen echte Kandidaten
  an vorher festgelegten Schwellen, und ihre Wegwerf-Umsetzungen blieben
  Wegwerf-Umsetzungen.
- **Weniger Wiederholungsarbeit.** Gerüste, geradlinige Umformungen,
  Testmatrizen, Adapterumsetzungen und breite, aber mechanische Umbauten
  entstehen schnell und werden dann als eine zusammenhängende Änderung
  geprüft.
- **Sichererer großer Umbau, wo Nachweise schon bestehen.** Eine starke
  Prüfsammlung gibt schnelle Rückmeldung, während Namen und Grenzen wandern.
  Die Tests belegen für sich genommen keine Qualität, aber sie machen eine
  breite Änderung beobachtbar.

## Fachwissen ist die Voraussetzung, nicht das Ersetzte

Vibe Coding vervielfacht das Urteilsvermögen, das darauf angewandt wird. Es
vervielfacht schlechtes Urteilsvermögen ebenso wirksam wie gutes.

Wer Produktionsarbeit leitet, muss die Architektur und ihre Invarianten
festlegen, eine bloß überzeugend aussehende Lösung erkennen, erzeugten Code
lesen und ablehnen, die Folgen für Sicherheit und Wartung beurteilen und
wissen können, wann eine automatische Prüfung nicht ausreicht. Zum Lernen oder
für einen Prototyp kann das jede und jeder nutzen. Ein Produktionsprojekt
braucht weiterhin jemanden, der fachlich qualifiziert ist, jedes angenommene
Ergebnis zu verantworten.

## Wie dieses Projekt die Verantwortung beim Menschen hält

Der Arbeitsablauf ist um diese Verantwortung herum gebaut, und er ist im
Repository sichtbar, statt hier behauptet zu werden:

1. **Die Spezifikation entsteht vor dem Code.** Eine Änderung, die Verhalten
   ändert, ändert [`specification.md`](../engineering/specification.md) in
   derselben Änderung. Steht eine Regel nicht dort, gibt es sie noch nicht.
2. **[`testing.md`](../engineering/testing.md) legt fest, was als Nachweis
   zählt**, je Schicht, bevor der Nachweis entsteht.
3. **Jede neue Prüfung wird falsifiziert.** Das Verhalten wird absichtlich
   kaputtgemacht, die Prüfung wird beim Rotwerden beobachtet, und sie muss aus
   dem *richtigen Grund* rot werden. Das ist die wichtigste Regel des
   Projekts, und sie hat wiederholt Prüfungen gefunden, die überhaupt nicht
   fehlschlagen konnten.
4. **Screenshots werden angesehen.** Der Schreibtischprüfstand schreibt sie;
   ein Mensch öffnet sie. Mehrere echte Fehler wurden so und auf keine andere
   Weise gefunden.
5. **Eine Regel, die eine reine Funktion sein kann, ist eine reine Funktion**
   — in einem portablen Kern ohne DOM, ohne Electron und ohne
   Node-Schnittstellen. Ohne Fenster prüfbar, und unmöglich in einer
   Komponente abweichend noch einmal umzusetzen.
6. **Grenzen sind Verträge.** Der Renderer läuft in der Sandbox und bekommt
   undurchsichtige Griffe; jede Anfrage über die Brücke wird zur Laufzeit im
   Hauptprozess geprüft, weil ein Typ zur Übersetzungszeit keine Prüfung ist.
7. **Abhängigkeiten werden nach Fähigkeit, Lizenz, Laufzeitwirkung,
   Offline-Verhalten und Ersetzbarkeit angenommen** — nie, weil eine
   Versionsnummer höher ist.
8. **Fehler werden aufgeschrieben.**
   [`completed-work.md`](../engineering/completed-work.md) hält fest, was jede
   Runde gelehrt hat, einschließlich dessen, was schiefging. Das ist keine
   Zierde, sondern der Weg, denselben Fehler nicht zweimal zu machen.

Ein Agent darf einen großen Teil einer Änderung umsetzen. Er kann keine dieser
Anforderungen senken.

## Was das tatsächlich gefangen hat

Das sind keine Gedankenspiele. Jeder Punkt wurde durch den obigen Ablauf in
diesem Repository gefunden:

- **Eine Prüfung, die nicht fehlschlagen konnte.** Eine Navigationsmethode
  trug eine Schleife, die ein gelöschtes Blatt übersprang. Sie las sich gut
  und war unerreichbar: Ein früherer Schritt entfernte solche Einträge längst.
  Die Falsifikation bewies es — der Test blieb grün, obwohl der Code
  absichtlich kaputt war. Die Schleife ist weg, und die Methode sagt jetzt,
  warum sie keine Wache braucht.
- **Eine Zeichenklasse, die die Ziffern fraß.** `[ -<>:"/\|?*]` liest sich als
  Bereich von Leerzeichen bis `<`, und der enthält jede Ziffer. Ein Projekt
  namens „Book 2 of 3" wäre als „Book of" angeboten worden. Der Test, der das
  fing, ist jetzt der, der es benennt.
- **Derselbe Fehler in anderer Gestalt, einen Tag später**, beim Schreiben
  dieser Klasse in eine andere Datei — diesmal gerieten echte Steuerzeichen in
  den Quelltext. Die Regel wurde eine Liste von Zeichen plus ein
  Codepunkt-Test, mit einem Kommentar, der sagt warum.
- **Zeilen von fünfundneunzig Zeichen** im ersten exportierten PDF. Keine
  Zusicherung hätte das je erwähnt. Jemand hat die Seite angesehen.
- **Ein Menü, das die Kopfzeile verdeckte**, aus der es geöffnet wurde — und,
  schlimmer, per Tastatur geöffnet gar keinen Ort gehabt hätte. In einem
  Screenshot gefunden, behoben durch Verankerung am Knopf.

## Was diese Erklärung nicht behauptet

- Erzeugte Ausgabe ist nicht richtig, weil sie übersetzt.
- Automatische Tests können nicht jedes Versagen in Bedienbarkeit, Sicherheit,
  Paketierung oder Architektur abdecken. Genau dafür gibt es die visuellen und
  nativen Prüfungen — und deshalb hält die
  [Plattformmatrix](platforms.md) fest, was *nicht* geprüft wurde.
- Menschliche Rechenschaft, Prüfung und Wartungsverantwortung werden nicht an
  ein Modell abgegeben.
- Schnelle Umsetzung ist kein Nachweis für Produktionsreife.
- Diese Arbeitsweise taugt nicht für eine ungeprüfte Änderung an
  sicherheitskritischem oder die Privatsphäre berührendem Verhalten.

Die Behauptung ist enger und stärker als „KI hat es geschrieben": Dialogische
KI kann ein starker technischer Verstärker sein, wenn eine erfahrene Person
die Architektur führt, das Ergebnis versteht und auf ausdrücklichen Nachweisen
besteht.

## Wo die Nachweise liegen

- [Spezifikation](../engineering/specification.md) — was das Produkt tun muss.
- [testing](../engineering/testing.md) — was wahr sein muss, bevor etwas
  behauptet wird.
- [completed work](../engineering/completed-work.md) — jede Runde mit ihrer
  Begründung, ihrer Prüfung und ihren Lehren.
- [Projektstatus](project-status.md) — was gebaut ist und was nicht.
