import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFERENCES } from '@opera-incerta/core';
import {
  BUILT_IN_STYLESHEETS,
  DEFAULT_STYLESHEET,
  DEFAULT_STYLESHEET_ID,
  builtInStylesheet,
  documentHtml,
  isBuiltInStylesheetId,
} from '../src/index.js';

describe('the supplied stylesheets (specification.md §15.2)', () => {
  it('offers four, with the manuscript as the one every fallback lands on', () => {
    expect(BUILT_IN_STYLESHEETS).toEqual(['manuscript', 'typescript', 'reading', 'plain']);
    expect(DEFAULT_STYLESHEET_ID).toBe('manuscript');
    expect(DEFAULT_STYLESHEET).toBe(builtInStylesheet('manuscript'));
    // The core cannot import this module, so its preference record carries
    // the name as a literal. This is what keeps the two from drifting.
    expect(DEFAULT_PREFERENCES.exportStylesheet).toBe(DEFAULT_STYLESHEET_ID);
  });

  it('gives each one a measure, a family and the shared block rules', () => {
    for (const id of BUILT_IN_STYLESHEETS) {
      const css = builtInStylesheet(id);
      expect(css, id).toContain('max-width:');
      expect(css, id).toContain('font-family:');
      // The common rules are what make Markdown read as prose at all.
      expect(css, id).toContain('blockquote');
      expect(css, id).toContain('break-inside: avoid');
    }
  });

  it('differs where it says it differs', () => {
    // The typescript is what a manuscript is sent in to be marked up: the
    // space between the lines is the point.
    expect(builtInStylesheet('typescript')).toContain('line-height: 2');
    expect(builtInStylesheet('typescript')).toContain('monospace');
    // Reading is for a screen, so nothing starts a page of its own.
    expect(builtInStylesheet('reading')).toContain('.sheet, h1 { break-before: auto; }');
    expect(builtInStylesheet('manuscript')).not.toContain('.sheet, h1 { break-before: auto; }');
  });

  it('reaches nothing and runs nothing, in any of the four', () => {
    for (const id of BUILT_IN_STYLESHEETS) {
      const css = builtInStylesheet(id);
      // A manuscript never reaches the network (AGENTS.md), and a stylesheet
      // that imported or fetched would be the one thing that did.
      expect(css, id).not.toContain('@import');
      expect(css, id).not.toContain('url(');
      expect(css, id).not.toContain('http');
    }
  });

  it('knows its own ids and refuses anything else', () => {
    expect(isBuiltInStylesheetId('reading')).toBe(true);
    expect(isBuiltInStylesheetId('mine')).toBe(false);
    expect(isBuiltInStylesheetId(null)).toBe(false);
  });

  it('is what the document carries when one is chosen', () => {
    const html = documentHtml({
      title: 'A Novel',
      parts: [],
      stylesheet: builtInStylesheet('typescript'),
    });

    expect(html).toContain('line-height: 2');
    expect(html).not.toContain('Georgia');
  });
});
