/**
 * How the exported document is set. specification.md §15.2.
 *
 * Four supplied sheets, plain on purpose: this export is not a print file. No
 * title page, no running heads, no print geometry — those are decisions a
 * print file needs and this one does not.
 *
 * They are strings rather than files because the document that carries one
 * must be **self-contained**: an exported page that fetched a stylesheet
 * would reach the network, and a manuscript never does (`AGENTS.md`).
 *
 * **Two things are deliberately not here**, both because Chromium's printer
 * owns them and a rule here would silently do nothing: the **page margins**,
 * which `printToPDF`'s own option overrides, and the **page numbers**, which
 * would need `@page` margin boxes it does not implement. Both are set beside
 * the call, in `apps/desktop/src/export.ts`.
 */

/** The supplied sheets. An author's own are files in the project (§15.2). */
export const BUILT_IN_STYLESHEETS = ['manuscript', 'typescript', 'reading', 'plain'] as const;

export type BuiltInStylesheetId = (typeof BUILT_IN_STYLESHEETS)[number];

/** The one every fallback lands on. */
export const DEFAULT_STYLESHEET_ID: BuiltInStylesheetId = 'manuscript';

export function isBuiltInStylesheetId(value: unknown): value is BuiltInStylesheetId {
  return typeof value === 'string' && (BUILT_IN_STYLESHEETS as readonly string[]).includes(value);
}

/**
 * What every sheet shares: the block rules that make Markdown read as prose.
 *
 * Kept apart from the four so that a difference between them is a difference
 * that was meant — and so that duplicating one gives the author a file they
 * can read, rather than four hundred lines of the same thing.
 */
const COMMON = `
  body {
    margin: 0 auto;
    color: #111;
  }
  /* Each sheet begins a page — never the first one, which would open on a
     blank leaf. A sheet that follows a group's heading stays with it. */
  .sheet {
    break-before: page;
  }
  .sheet:first-of-type,
  h1 + .sheet, h2 + .sheet, h3 + .sheet,
  h4 + .sheet, h5 + .sheet, h6 + .sheet {
    break-before: auto;
  }
  h1, h2, h3, h4, h5, h6 {
    margin: 1.6em 0 0.6em;
    line-height: 1.25;
    break-after: avoid;
  }
  h1 {
    margin-top: 0;
    break-before: page;
  }
  .sheet h1 {
    break-before: auto;
  }
  p {
    margin: 0 0 0.7em;
    orphans: 2;
    widows: 2;
  }
  blockquote {
    margin: 1em 0 1em 1.5em;
    color: #333;
    font-style: italic;
  }
  ul, ol {
    margin: 0 0 0.7em;
    padding-inline-start: 1.4em;
  }
  li {
    margin-bottom: 0.2em;
  }
  pre {
    padding: 0.7em 0.9em;
    border-radius: 3px;
    background: #f4f4f4;
    white-space: pre-wrap;
    word-wrap: break-word;
    break-inside: avoid;
  }
  hr {
    height: 0;
    margin: 1.6em auto;
    width: 30%;
    border: 0;
    border-top: 1px solid #bbb;
  }
  table {
    margin: 0 0 1em;
    border-collapse: collapse;
    break-inside: avoid;
  }
  th, td {
    padding: 0.3em 0.7em;
    border: 1px solid #ccc;
    text-align: start;
  }
  img {
    max-width: 100%;
  }
`;

/**
 * The default: a serif, a measure that reads, each sheet on a page.
 *
 * The measure is the rule worth stating. At 11pt across a printed page the
 * line would run to about ninety-five characters, and a line that long is
 * read by losing one's place at the end of it.
 */
const MANUSCRIPT = `
  html { font-size: 11pt; }
  body {
    max-width: 34em;
    font-family: Georgia, 'Iowan Old Style', 'Times New Roman', serif;
    line-height: 1.5;
  }
  h1, h2, h3, h4, h5, h6 { font-weight: 600; }
  h1 { font-size: 1.9em; }
  h2 { font-size: 1.45em; }
  h3 { font-size: 1.2em; }
  h4, h5, h6 { font-size: 1em; }
  code, pre { font-family: 'SF Mono', Menlo, Consolas, monospace; font-size: 0.88em; }
  pre code { font-size: 1em; }
${COMMON}`;

/**
 * A publisher's typescript, for editing.
 *
 * Monospaced, double-spaced, and narrow — the shape a manuscript is sent in
 * to be marked up, where the space between the lines is the point.
 */
const TYPESCRIPT = `
  html { font-size: 12pt; }
  body {
    max-width: 30em;
    font-family: 'Courier New', Courier, monospace;
    line-height: 2;
  }
  h1, h2, h3, h4, h5, h6 { font-size: 1em; font-weight: 700; text-transform: uppercase; }
  h1 { letter-spacing: 0.08em; }
  p { text-indent: 2em; margin: 0; }
  /* The first paragraph after a heading is not indented — the indent marks a
     new paragraph, and after a heading there is nothing to mark it against. */
  h1 + p, h2 + p, h3 + p, h4 + p, h5 + p, h6 + p { text-indent: 0; }
  blockquote { font-style: normal; }
  code, pre { font-family: inherit; font-size: 1em; }
  pre { background: none; border-left: 3px solid #999; border-radius: 0; }
${COMMON}`;

/**
 * For reading on a screen rather than on paper.
 *
 * Larger, and **no page break between sheets**: a break is a courtesy to a
 * binder and an interruption to a reader scrolling through.
 */
const READING = `
  html { font-size: 13pt; }
  body {
    max-width: 32em;
    font-family: Georgia, 'Iowan Old Style', 'Times New Roman', serif;
    line-height: 1.65;
  }
  h1, h2, h3, h4, h5, h6 { font-weight: 600; }
  h1 { font-size: 1.7em; }
  h2 { font-size: 1.35em; }
  h3 { font-size: 1.15em; }
  h4, h5, h6 { font-size: 1em; }
  code, pre { font-family: 'SF Mono', Menlo, Consolas, monospace; font-size: 0.88em; }
  pre code { font-size: 1em; }
${COMMON}
  /* After the common rules, so these win: nothing starts a page of its own. */
  .sheet, h1 { break-before: auto; }
`;

/** Sans-serif and close-set, for a working print of the whole thing. */
const PLAIN = `
  html { font-size: 10pt; }
  body {
    max-width: 38em;
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    line-height: 1.4;
  }
  h1, h2, h3, h4, h5, h6 { margin: 1.2em 0 0.4em; font-weight: 700; }
  h1 { font-size: 1.6em; }
  h2 { font-size: 1.3em; }
  h3 { font-size: 1.1em; }
  h4, h5, h6 { font-size: 1em; }
  p { margin: 0 0 0.5em; }
  code, pre { font-family: 'SF Mono', Menlo, Consolas, monospace; font-size: 0.9em; }
  pre code { font-size: 1em; }
${COMMON}`;

const SUPPLIED: Readonly<Record<BuiltInStylesheetId, string>> = {
  manuscript: MANUSCRIPT,
  typescript: TYPESCRIPT,
  reading: READING,
  plain: PLAIN,
};

/** The CSS of a supplied sheet. */
export function builtInStylesheet(id: BuiltInStylesheetId): string {
  return SUPPLIED[id];
}

/** The default, by name, for everything that needs one without asking. */
export const DEFAULT_STYLESHEET = SUPPLIED[DEFAULT_STYLESHEET_ID];
