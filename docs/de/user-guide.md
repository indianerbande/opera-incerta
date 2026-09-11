# Benutzerhandbuch für Opera Incerta

[English](../en/user-guide.md) | **Deutsch**

Gilt für `v0.1.0-beta.1`. Was noch nicht gebaut ist, steht im
[Projektstatus](project-status.md), statt hier angedeutet zu werden.

## Was diese Anwendung ist

Opera Incerta sammelt Texte und lässt daraus ein strukturiertes Buchmanuskript
wachsen. Sie ist ein **lokales** Werkzeug: Ihr Manuskript ist ein Ordner
gewöhnlicher Markdown-Dateien auf Ihrer eigenen Platte, und die Anwendung
braucht für nichts auf dieser Seite ein Konto, eine Cloud oder ein Netz.

Die Zusage, die jede andere Entscheidung prägt: **Ihre Dateien bleiben Ihre
und bleiben von allem anderen lesbar.** Ein Text ist eine Datei. Eine Gruppe
ist ein Verzeichnis. Metadaten stehen im Kopf der Datei, zu der sie gehören.
Würden Sie diese Anwendung morgen deinstallieren, wäre Ihr Manuskript genau
das, was es heute ist.

## Projekte

Ein Projekt ist ein Ordner mit einem Verzeichnis `.opera-incerta/` darin. Es
enthält den Projektsatz, die festgehaltene Reihenfolge und die Anzeigenamen
Ihrer Gruppen, Ihre Seitenkategorien, die Liste der zuletzt bearbeiteten
Blätter und die Export-Stylesheets, die Sie angelegt haben. Alles andere im
Ordner ist Ihr Manuskript.

### Ein Projekt anlegen

**Datei ▸ Neues Projekt…** (`Cmd/Strg+Umschalt+N`) fragt, wo es liegen und wie
es heißen soll. Der Ordner bekommt einen Bezeichner aus dem Namen; der Name
selbst wird festgehalten und kann sich später ändern, ohne dass der Ordner
umzieht.

### Ein Projekt öffnen

**Datei ▸ Projekt öffnen…** (`Cmd/Strg+O`). Der Starter führt außerdem die
zuletzt geöffneten Projekte auf.

### Einen Ordner öffnen, der kein Projekt ist

Zeigen Sie mit der Auswahl auf irgendeinen Ordner, und die Anwendung erkennt,
was er ist:

- **Er ist ein Projekt** — er öffnet sich.
- **Er ist keines und enthält keines** — Ihnen wird angeboten, ihn zu
  *übernehmen*. Das Übernehmen legt ein Verzeichnis `.opera-incerta/` an und
  ändert sonst nichts: Keine Datei wird verschoben, umbenannt oder
  umgeschrieben. Ihr vorhandenes Markdown wird die Bibliothek, so wie es ist.
- **Er enthält genau ein Projekt** — dieses Projekt wird angeboten.
- **Er enthält mehrere** — sie werden benannt, und Sie wählen.

So bringen Sie ein Manuskript, das Sie schon haben, in die Anwendung.

## Die Bibliothek

Drei Spalten: links der **Projektbaum**, daneben die **Blätter der gewählten
Gruppe** und dann der **Editor**.

Der Baum zeigt Gruppen; die Blattliste zeigt die direkten Blätter der gerade
gewählten Gruppe — ihre eigenen, nicht die ihrer Untergruppen.

### Anlegen, umbenennen, löschen

Rechtsklick auf eine Gruppe für **Neues Blatt…**, **Neue Gruppe…**,
**Umbenennen…** und — außer an der Wurzel — **Gruppe löschen…**. Rechtsklick
auf ein Blatt für **Umbenennen…**, **Blatt löschen…** und die beiden Exporte
„ab hier".

**Umbenennen ändert einen Titel, nie einen Dateinamen.** Der Dateiname eines
Blattes entsteht einmal aus dem Titel, den Sie ihm zuerst gaben, und bleibt
dann; der Titel steht in den Variablen der Datei und darf sich beliebig oft
ändern. Bei einer Gruppe verhält es sich ebenso, wobei der Anzeigename im
Projekt festgehalten wird.

Das ist die Regel, die die Geschichte eines Manuskripts lesbar hält: Ihre
Commits zeigen Bearbeitungen, kein Gewitter aus Umbenennungen.

Löschen legt den Eintrag in den Papierkorb Ihres Systems, wo Sie ihn
zurückholen können. Eine Gruppe nimmt ihren Inhalt mit, und Ihnen wird vor dem
Bestätigen gesagt, wie viele Blätter und Untergruppen das sind.

### Reihenfolge

Ziehen Sie ein Blatt innerhalb seiner Gruppe oder eine Gruppe innerhalb ihrer
Elterngruppe, um die Reihenfolge festzulegen. Sie wird im Projekt
festgehalten, die Reihenfolge der Anwendung und die alphabetische Ihres
Dateimanagers dürfen also auseinandergehen.

Ein Blatt in eine Gruppe zu ziehen oder eine Gruppe in eine andere verschiebt
sie — und der Editor folgt, wenn das verschobene Blatt geöffnet war.

### Seitenkategorien

Jedes Projekt legt seine eigenen Kategorien fest, mit Namen und Farbe —
„Entwurf", „Quelle fehlt", „Vorerst gestrichen". Zugewiesen wird im Inspektor;
die Menge verwalten Sie mit **Verwalten…** daneben. Eine Kategorie, die ein
Blatt nennt und die es nicht mehr gibt, liest sich schlicht als
„keine Kategorie" — das ist kein Fehler.

## Der Editor

### Formatierung wird gezeigt, nicht ausgeschrieben

Eine Überschrift erscheint in ihrer eigenen Größe, mit der Ebene am Rand
beschriftet, nicht als `# `. Auszeichnungen, Code im Fließtext und
Durchstreichungen erscheinen als das, was sie bedeuten. Zitate, Listen,
Aufgabenkästchen und Trennlinien erscheinen als sie selbst.

**In der Zeile, in der Ihr Cursor steht, kommen die Zeichen zurück**, damit
der Text als Text bearbeitbar bleibt. Nichts ist verborgen, an das Sie nicht
durch Hineinfahren mit dem Cursor kämen.

In einem eingezäunten Codeblock wird gar nichts umgewandelt — ein Codebeispiel
erscheint genau so, wie es geschrieben steht.

### Was auf der Platte steht

Standardkonformes Markdown. `#`, `**Text**`, `- Punkt`, `> Zitat`,
Backticks. Jeder andere Editor liest es verlustfrei, und ein Durchlauf durch
diese Anwendung schreibt nicht um, was ihr nicht gehört.

### Mit Überschriften arbeiten

- Tippen Sie `# ` am Zeilenanfang, wie überall sonst.
- Die Randmarke neben einer Überschrift öffnet ein Menü der Ebenen.
- Rückschritt am Anfang einer Überschrift entfernt erst die Ebene und führt
  dann die Zeilen zusammen — ein Undo-Schritt, nicht zwei.
- Eine Überschriftszeile auszuschneiden nimmt ihre Ebene mit, sie bleibt beim
  Einfügen also eine Überschrift.

### Die Statusleiste

Unten rechts im Editor: Zeile und Spalte des Cursors, ein Schalter
**Umbruch**, der nur diesem Blatt gehört, und ein Zoom. Der Zoom wird wie eine
Spaltenbreite gemerkt; er rührt die Datei nicht an.

### Zeilennummern

Standardmäßig aus; eine Einstellung schaltet sie ein.

### Im offenen Blatt suchen

**Bearbeiten ▸ Suchen…** (`Cmd/Strg+F`) öffnet eine Leiste zwischen Kopfzeile
und Text — sie schiebt den Text nach unten, statt die Zeile zu verdecken, die
Sie gerade suchten. Was Sie markiert hatten, wird als Suchbegriff angeboten.

Jeder Treffer wird markiert; die Leiste zählt sie. Die Suche beginnt **an
Ihrem Cursor**, nicht oben. Return springt vorwärts, `Umschalt+Return`
rückwärts, und beide laufen um. Escape schließt die Leiste und nimmt die
Markierungen mit.

## Variablen

Jedes Blatt kann YAML-Variablen im Kopf tragen: Titel, Thema, Schlagwörter,
Status, Kategorie und Notizen. Die Anwendung besitzt genau einen
obersten Schlüssel, `opera-incerta:`. Alles andere in diesem Block gehört dem
Werkzeug, das es dort hingeschrieben hat, und bleibt über jedes Laden und
Speichern **Byte für Byte** erhalten.

Die eigenen Felder bearbeiten Sie rechts im **Inspektor**.

Der rohe Block lässt sich in einem eigenen Bereich über der Schreibfläche
zeigen — schalten Sie **Variablen** in der Kopfzeile des Editors ein. Er ist
**schreibgeschützt, bis Sie es anders sagen**, denn Ansehen ist harmlos, und
YAML von Hand zu bearbeiten ist der Weg, auf dem eine Datei unlesbar wird.

Lassen sich die Variablen einer Datei nicht verstehen — ein fehlerhafter
`opera-incerta:`-Block oder der Schlüssel zweimal —, wird das Blatt gezeigt
und als **schreibgeschützt** gekennzeichnet. Die Anwendung rät nicht, was
gemeint war, und schreibt nicht darüber.

## Die Bibliothek durchsuchen

Die Lupe in der linken Leiste schaltet den Navigator auf die Suche. Sie
durchsucht den **Text** jedes Blattes im Projekt — ausdrücklich nicht die
Variablen, damit die Suche nach einem Wort es dort findet, wo es geschrieben
wurde, und nicht dort, wo es abgelegt ist.

Jeder Treffer nennt sein Blatt, seine Zeile und die Zeile selbst mit
markierter Fundstelle. Einen davon zu wählen öffnet das Blatt und setzt den
Cursor auf diese Zeile. Eine Suche ist flüchtig: Sie wird nicht gespeichert,
und Leeren vergisst sie.

## Wo Sie waren

**Gehe zu ▸ Zurück** (`Cmd/Strg+[`) und **Vorwärts** (`Cmd/Strg+]`) gehen
durch die Blätter, die Sie geöffnet haben, wie ein Browser. Ein Blatt nach
einem Rücksprung zu öffnen verwirft, was vor Ihnen lag.

Die Kopfzeile des Navigators hat einen Knopf **Zuletzt**: die letzten zehn
Blätter, die Sie **gespeichert** haben, das neueste zuerst. Ein Blatt zu
öffnen ist kein Bearbeiten, nur ein Speichern bringt eines in die Liste. Diese
Liste liegt im Projekt und reist mit ihm.

## Versionsverwaltung

Der zweite Eintrag in der linken Leiste. Sie arbeitet auf dem Git-Repository
**Ihres Projekts** und tut nur, worum Sie bitten.

- **Status** jeder geänderten Datei, vorgemerkt und nicht vorgemerkt.
- **Vormerken**, **zurücknehmen**, **Commit**, **Push**.
- **Abrufen** und **Pull**, mit dem angezeigten Upstream des Branches.
- **Zusammenführen**, mit Konflikten **je Region** entschieden: Jede
  konfliktbehaftete Passage wird so oder so entschieden, und die Datei wird
  ohne Markierung darin zurückgeschrieben.
- **Branches**: auflisten, anlegen, wechseln — wobei ein Wechsel über
  ungespeicherter Arbeit innehält und fragt —, veröffentlichen und löschen.
- **Den letzten Commit ersetzen**, angeboten nur solange er nicht gepusht ist.
- **`.gitignore`**, als Text bearbeitbar, und eine Datei mit einem Klick
  ignorieren.
- **Verwerfen**, was vorher fragt, weil es sich nicht rückgängig machen lässt.

Ein verstecktes Pull, Auschecken, Verwerfen oder Umschreiben der Geschichte
gibt es bewusst **nicht**. Mit Ihrem Repository geschieht nichts, das Sie
nicht angeklickt haben.

### Sehen, was sich geändert hat

Eine geänderte Datei öffnet sich **Wort für Wort**: Was sich geändert hat, ist
markiert, und der Rest der Datei liest sich ringsum normal. Gits eigene
Zeilenansicht ist einen Klick entfernt. Für ein Manuskript ist die Prosa die
nützliche Ansicht — ein Zeilenvergleich eines neu umbrochenen Absatzes sagt
nichts.

### Wenn das Projekt kein Repository hat

Der Bereich bietet an, eines anzulegen. Beim Anlegen wird auch nach Name und
Adresse gefragt, die Ihre Commits verfassen sollen — und beides wird nur in
dieses Repository geschrieben, nie in Ihre globale Git-Konfiguration.

## Exportieren

**Datei ▸ Exportieren ▸ Markdown…** (`Cmd/Strg+Umschalt+M`) oder **PDF…**
(`Cmd/Strg+Umschalt+P`) schreibt das ganze Manuskript heraus. Rechtsklick auf
ein Blatt bietet dieselben zwei **ab hier**, beginnend bei diesem Blatt.

Wie zusammengesetzt wird:

- Die Reihenfolge ist die festgehaltene der Bibliothek.
- **Eine Gruppe wird eine Überschrift** ihrer Tiefe, und die Überschriften der
  Blätter darin rücken darunter eine Ebene tiefer. Ihre Bibliotheksstruktur
  wird die Struktur des Dokuments.
- **Variablen erscheinen nie.**
- „Ab hier" nimmt die Gruppen **über** dem Startblatt mit, damit ein Auszug
  seinen Ort im Buch behält, statt in der Luft zu beginnen.

### Wählen, wie das PDF gesetzt wird

Ein PDF fragt, welches Stylesheet es verwenden soll. Vier sind mitgeliefert:

| | wofür |
| --- | --- |
| **Manuskript** | Der Standard: eine Serife, ein lesbarer Satzspiegel, jedes Blatt auf einer neuen Seite. |
| **Typoskript** | Monospace und doppelter Zeilenabstand — die Form, in der ein Manuskript zum Lektorat geht. |
| **Lesen** | Größer, fließend, kein Seitenumbruch zwischen Blättern. |
| **Schlicht** | Serifenlos und eng, für einen Arbeitsausdruck. |

**Duplizieren…** macht eines unter neuem Namen zu Ihrem, **Bearbeiten…**
öffnet es als CSS. Ihre Stylesheets sind Dateien in `.opera-incerta/styles/`,
gehören also zum Manuskript und reisen mit ihm.

Zwei Dinge kann ein Stylesheet nicht setzen, weil der Drucker sie besitzt: die
Seitenränder und die Seitenzahlen.

Das PDF setzt die Anwendung selbst. Es ist nichts zu installieren.

## Einstellungen und Erscheinungsbild

**Einstellungen…** (`Cmd/Strg+,`) oder das Zahnrad unten in der linken Leiste.

- **Sprache der Oberfläche**: Deutsch, Englisch oder was das System sagt. Sie
  wechselt sofort, einschließlich des nativen Menüs.
- **Erscheinungsbild**: hell, dunkel oder die Wahl des Systems; dazu eine von
  acht Akzentpaletten.
- **Dichte der Blattliste**: drei Vorschaugrößen.
- **Editor**: Schriftfamilie, Grundgröße, Umbruch, Zeilennummern.

Die Schrift ist mit der Anwendung mitgeliefert statt vom System geborgt, ein
Manuskript sieht also auf jeder Maschine gleich aus.

Einstellungen ändern nie ein Dokument, kennzeichnen nie eines als ungespeichert
und ändern nie einen Dateiinhalt.

## Tastatur

Jede Handlung hat einen Menüeintrag oder ein Kürzel; nichts ist allein durch
Klicken erreichbar.

| | |
| --- | --- |
| `Cmd/Strg+Umschalt+N` | Neues Projekt |
| `Cmd/Strg+O` | Projekt öffnen |
| `Cmd/Strg+Umschalt+W` | Projekt schließen |
| `Cmd/Strg+S` | Offenes Blatt speichern |
| `Cmd/Strg+F` | Im offenen Blatt suchen |
| `Cmd/Strg+[` / `Cmd/Strg+]` | Zurück / vorwärts |
| `Cmd/Strg+Umschalt+M` | Markdown exportieren |
| `Cmd/Strg+Umschalt+P` | PDF exportieren |
| `Cmd/Strg+,` | Einstellungen |

Dazu die Bearbeitungstasten der Plattform, die erhalten statt ersetzt werden.

## Wenn sich eine Datei hinter dem Rücken der Anwendung ändert

Das Projekt wird beobachtet. Wenn Sie ein Blatt in einem anderen Editor
bearbeiten oder eine Änderung mit Git holen:

- **und nichts ungespeichert ist** — übernimmt der Editor den neuen Text
  stillschweigend.
- **und Sie mitten in etwas waren** — werden Sie einmal gefragt, und bis Sie
  antworten, geht nichts verloren. Ihre Fassung zu behalten ändert nichts auf
  der Platte; ein späteres Speichern überschreibt die Datei.

Eine Datei, die eine Zusammenführung mit Konfliktmarkierungen hinterlassen
hat, wird **schreibgeschützt** gezeigt, bis der Konflikt entschieden ist —
damit Sie nicht versehentlich eine Fassung speichern, die keine von beiden
ist.

## Wo was liegt

**In Ihrem Projekt**, und in Ihre Versionsverwaltung gehörend:

```text
ihr-manuskript/
├── .opera-incerta/
│   ├── project.json        Identität und Name des Projekts
│   ├── structure.json      festgehaltene Reihenfolge und Gruppennamen
│   ├── categories.json     Ihre Seitenkategorien
│   ├── recent.json         zuletzt bearbeitete Blätter
│   └── styles/             Export-Stylesheets, die Sie angelegt haben
├── eroeffnung.md
└── erster-teil/
    └── eine-szene.md
```

**Nur auf dieser Installation** und nie in ein Projekt geschrieben: die Liste
der zuletzt geöffneten Projekte und Ihre Einstellungen, im
Benutzerdatenverzeichnis Ihres Betriebssystems.

## Hilfe und Fehlermeldungen

- [Projektstatus](project-status.md) — was gebaut ist und was nicht.
- [Aus dem Quellcode bauen](build-from-source.md) — starten und prüfen.
- [Ein Problem melden](https://github.com/indianerbande/opera-incerta/issues)
  — mit Version, Betriebssystem und den Schritten.
- [Sicherheitsrichtlinie](../../SECURITY.de.md) — für alles, was nicht
  öffentlich stehen sollte.
