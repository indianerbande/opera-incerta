import { describe, expect, it } from 'vitest';
import { DEFAULT_STYLESHEET, documentHtml, escapeHtml } from '../src/index.js';

describe('the printable document (SPEC.md §15.2)', () => {
  it('is self-contained: its own style, nothing fetched', () => {
    const html = documentHtml({ title: 'A Novel', parts: [] });

    expect(html).toContain(`<style>${DEFAULT_STYLESHEET}</style>`);
    // A manuscript never reaches the network (AGENTS.md), and a page that
    // linked a stylesheet or a font would.
    expect(html).not.toMatch(/<link\b/u);
    expect(html).not.toMatch(/https?:\/\//u);
  });

  it('cannot execute anything, by two independent means', () => {
    const html = documentHtml({
      title: 'A Novel',
      parts: [
        { kind: 'heading', level: 1, text: '<script>alert(1)</script>' },
        { kind: 'sheet', relativePath: 'a.md', markdown: '<script>alert(2)</script>\n' },
      ],
    });

    // The parser escapes it, and the policy would refuse it even if one day
    // something did not. Either alone would be a claim resting on one line.
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain(`default-src 'none'`);
  });

  it('puts each sheet in its own section, which is what the page break needs', () => {
    const html = documentHtml({
      title: 'A Novel',
      parts: [
        { kind: 'heading', level: 2, text: 'Part One' },
        { kind: 'sheet', relativePath: 'a.md', markdown: '## A Scene\n\nText.\n' },
      ],
    });

    expect(html).toContain('<h2>Part One</h2>');
    expect(html).toContain('<section class="sheet">');
    expect(html).toContain('<h2>A Scene</h2>');
    expect(DEFAULT_STYLESHEET).toContain('break-before: page');
  });

  it('renders what the export needs and rewrites nothing the author typed', () => {
    const html = documentHtml({
      title: 'A Novel',
      parts: [
        {
          kind: 'sheet',
          relativePath: 'a.md',
          markdown: '| a | b |\n| - | - |\n| 1 | 2 |\n\nSee https://example.invalid and "quotes".\n',
        },
      ],
    });

    // A table arrives as a table — the export hands the manuscript to someone
    // else, unlike the editor, which shows what stands in the file.
    expect(html).toContain('<table>');
    // But linkify and typographer stay off: the text is not improved. The
    // quotes arrive HTML-escaped — which is the codec of the page — and not
    // turned into typographic ones, which would be an edit.
    expect(html).not.toContain('<a href');
    expect(html).toContain('&quot;quotes&quot;');
    expect(html).not.toContain('&ldquo;');
  });

  it('escapes the five characters that would otherwise be markup', () => {
    expect(escapeHtml(`<&>"'`)).toBe('&lt;&amp;&gt;&quot;&#39;');
  });

  it('titles the page with the project, escaped', () => {
    expect(documentHtml({ title: 'A <Novel>', parts: [] })).toContain(
      '<title>A &lt;Novel&gt;</title>',
    );
  });
});
