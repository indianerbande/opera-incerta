/**
 * How the exported document is set. SPEC.md §15.2.
 *
 * Plain on purpose: this export is not a print file. A serif from what the
 * system has, a measure that reads, each sheet on a page of its own. No title
 * page, no running heads, no print geometry — those are decisions a print
 * file needs and this one does not.
 *
 * It is a string rather than a file because the document that carries it must
 * be **self-contained**: an exported page that fetched a stylesheet would
 * reach the network, and a manuscript never does (`AGENTS.md`).
 *
 * **Two things are deliberately not here**, both because Chromium's printer
 * owns them and a rule here would silently do nothing: the **page margins**,
 * which `printToPDF`'s own option overrides, and the **page numbers**, which
 * would need `@page` margin boxes it does not implement. Both are set beside
 * the call, in `apps/desktop/src/export.ts`. Naming it here keeps the next
 * reader from writing a rule that cannot work.
 *
 * Choosing a stylesheet of one's own is open work (SPEC.md §18); this is the
 * default that stands until then.
 */
export const DEFAULT_STYLESHEET = `
  html {
    font-size: 11pt;
  }
  body {
    /* A measure, not the page's full width: at 11pt across a printed page
       the line would run to about ninety-five characters, and a line that
       long is read by losing one's place at the end of it. */
    max-width: 34em;
    margin: 0 auto;
    color: #111;
    font-family: Georgia, 'Iowan Old Style', 'Times New Roman', serif;
    line-height: 1.5;
    text-rendering: optimizeLegibility;
  }
  /* Each sheet begins a page — never the first one, which would open on a
     blank leaf. */
  .sheet {
    break-before: page;
  }
  .sheet:first-of-type,
  h1 + .sheet,
  h2 + .sheet,
  h3 + .sheet,
  h4 + .sheet,
  h5 + .sheet,
  h6 + .sheet {
    break-before: auto;
  }
  h1, h2, h3, h4, h5, h6 {
    margin: 1.6em 0 0.6em;
    font-weight: 600;
    line-height: 1.25;
    break-after: avoid;
  }
  h1 {
    margin-top: 0;
    break-before: page;
    font-size: 1.9em;
  }
  .sheet h1 {
    break-before: auto;
  }
  h2 { font-size: 1.45em; }
  h3 { font-size: 1.2em; }
  h4, h5, h6 { font-size: 1em; }
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
  code, pre {
    font-family: 'SF Mono', Menlo, Consolas, monospace;
    font-size: 0.88em;
  }
  pre {
    padding: 0.7em 0.9em;
    border-radius: 3px;
    background: #f4f4f4;
    white-space: pre-wrap;
    word-wrap: break-word;
    break-inside: avoid;
  }
  pre code {
    font-size: 1em;
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
