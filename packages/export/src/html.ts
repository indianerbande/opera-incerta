/**
 * The document as a page that can be printed. SPEC.md §15.2.
 *
 * The parser here is **not** the editor's. The editor shows what stands in
 * the file and leaves tables and links to their own rounds
 * (`@opera-incerta/markdown`); the export hands the manuscript to someone
 * else, where a GFM table should arrive as a table. So this one runs
 * markdown-it's full preset — with `linkify` and `typographer` **off**,
 * because rewriting the author's text is never this module's business.
 *
 * `html: false` is the rule that matters: a manuscript is data, not a page to
 * be executed. What the author typed as `<script>` arrives as the five
 * characters they typed.
 */
import MarkdownIt from 'markdown-it';
import type { DocumentPart } from './document.js';
import { DEFAULT_STYLESHEET } from './stylesheet.js';

const renderer = new MarkdownIt('default', {
  html: false,
  linkify: false,
  typographer: false,
});

/** The five characters that must never reach the document as markup. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;');
}

export interface DocumentHtmlOptions {
  /** The project's display name. It titles the page; it is not printed. */
  readonly title: string;
  readonly parts: readonly DocumentPart[];
  /** Defaults to the plain one of SPEC.md §15.2; a chosen one is open work. */
  readonly stylesheet?: string;
}

/**
 * One self-contained document: its own style, no script, nothing fetched.
 *
 * The content security policy is the belt to `html: false`'s braces. Neither
 * alone would be enough to say the sentence this module needs to be able to
 * say: **an exported manuscript cannot execute anything.**
 */
export function documentHtml(options: DocumentHtmlOptions): string {
  const body = options.parts
    .map((part) =>
      part.kind === 'heading'
        ? `<h${part.level}>${escapeHtml(part.text)}</h${part.level}>`
        : `<section class="sheet">\n${renderer.render(part.markdown)}</section>`,
    )
    .join('\n');

  return [
    '<!doctype html>',
    '<html>',
    '<head>',
    '<meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">`,
    `<title>${escapeHtml(options.title)}</title>`,
    `<style>${options.stylesheet ?? DEFAULT_STYLESHEET}</style>`,
    '</head>',
    '<body>',
    body,
    '</body>',
    '</html>',
    '',
  ].join('\n');
}
