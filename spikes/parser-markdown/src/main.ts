/**
 * The Markdown parser spike. testing.md §2.11 fixes the seven criteria and
 * their thresholds; this program measures each candidate against them and
 * prints one table per criterion. The exit code is the verdict: zero when at
 * least one candidate passes every criterion.
 *
 * Disposable. Nothing here is production architecture, and no candidate's
 * types leave this file (conventions.md C-A6 begins where this spike ends).
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  markdownToDisplay,
  parseSheet,
  serializeSheet,
  type Sheet,
  type SheetMetadata,
} from '@opera-incerta/core';
import * as commonmark from 'commonmark';
import MarkdownIt from 'markdown-it';
import { Lexer, marked } from 'marked';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { micromark } from 'micromark';
import { gfm, gfmHtml } from 'micromark-extension-gfm';
import { parse as parseYaml } from 'yaml';

const here = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = join(here, '..', '..', '..');
const buildDirectory = join(repositoryRoot, 'build', 'spike-parser');

/** The published examples of CommonMark 0.31.2, fetched by hash. */
const SPEC_URL = 'https://spec.commonmark.org/0.31.2/spec.json';
const SPEC_SHA256 = 'd431b29d97b6f73e69d547109cf5081578fac931e72afe95639ebe766c1b2a20';

interface SpecExample {
  readonly markdown: string;
  readonly html: string;
  readonly example: number;
  readonly section: string;
}

/** A block the parser reports, in one-based lines, top-level only. */
interface ReportedBlock {
  readonly kind: 'heading' | 'code';
  readonly startLine: number;
  readonly endLine: number;
  readonly level: number | null;
}

interface Candidate {
  readonly name: string;
  /** The packages a production dependency would pull in. */
  readonly packages: readonly string[];
  readonly renderCommonMark: (markdown: string) => string;
  readonly renderGfm: (markdown: string) => string;
  /** Null when the parser reports no positions of its own. */
  readonly blocks: (markdown: string) => readonly ReportedBlock[] | null;
  readonly parseOnly: (markdown: string) => unknown;
}

// --- candidates -------------------------------------------------------------

const markdownItCommonMark = new MarkdownIt('commonmark');
const markdownItGfm = new MarkdownIt();

const markdownIt: Candidate = {
  name: 'markdown-it',
  packages: ['markdown-it'],
  renderCommonMark: (markdown) => markdownItCommonMark.render(markdown),
  renderGfm: (markdown) => markdownItGfm.render(markdown),
  blocks: (markdown) => {
    const blocks: ReportedBlock[] = [];
    for (const token of markdownItCommonMark.parse(markdown, {})) {
      if (token.level !== 0 || token.map === null) {
        continue;
      }
      const [start, end] = token.map;
      if (token.type === 'heading_open') {
        blocks.push({
          kind: 'heading',
          startLine: start + 1,
          endLine: end,
          level: Number(token.tag.slice(1)),
        });
      } else if (token.type === 'fence' || token.type === 'code_block') {
        blocks.push({ kind: 'code', startLine: start + 1, endLine: end, level: null });
      }
    }
    return blocks;
  },
  parseOnly: (markdown) => markdownItCommonMark.parse(markdown, {}),
};

const markedCandidate: Candidate = {
  name: 'marked',
  packages: ['marked'],
  renderCommonMark: (markdown) => marked.parse(markdown, { gfm: false, async: false }),
  renderGfm: (markdown) => marked.parse(markdown, { gfm: true, async: false }),
  // marked's tokens carry `raw` but no positions; the lines below are derived
  // by adding up the raw lengths, which is the translation layer re-scanning.
  // Criterion 2 therefore fails; criterion 3 is still measured with them.
  blocks: () => null,
  parseOnly: (markdown) => new Lexer({ gfm: false }).lex(markdown),
};

/** The derived positions of marked, kept apart so the table can say so. */
function markedDerivedBlocks(markdown: string): readonly ReportedBlock[] {
  const blocks: ReportedBlock[] = [];
  let line = 1;
  for (const token of new Lexer({ gfm: false }).lex(markdown)) {
    const raw = 'raw' in token ? token.raw : '';
    const lines = raw.split('\n').length - (raw.endsWith('\n') ? 1 : 0);
    if (token.type === 'heading') {
      blocks.push({ kind: 'heading', startLine: line, endLine: line + lines - 1, level: token.depth });
    } else if (token.type === 'code') {
      blocks.push({ kind: 'code', startLine: line, endLine: line + lines - 1, level: null });
    }
    line += lines;
  }
  return blocks;
}

const commonmarkParser = new commonmark.Parser();
const commonmarkRenderer = new commonmark.HtmlRenderer();

const commonmarkJs: Candidate = {
  name: 'commonmark.js',
  packages: ['commonmark'],
  renderCommonMark: (markdown) => commonmarkRenderer.render(commonmarkParser.parse(markdown)),
  renderGfm: (markdown) => commonmarkRenderer.render(commonmarkParser.parse(markdown)),
  blocks: (markdown) => {
    const blocks: ReportedBlock[] = [];
    const document = commonmarkParser.parse(markdown);
    for (let node = document.firstChild; node !== null; node = node.next) {
      const position = node.sourcepos;
      if (position === undefined) {
        continue;
      }
      const [[startLine], [endLine]] = position;
      if (node.type === 'heading') {
        blocks.push({ kind: 'heading', startLine, endLine, level: node.level });
      } else if (node.type === 'code_block') {
        blocks.push({ kind: 'code', startLine, endLine, level: null });
      }
    }
    return blocks;
  },
  parseOnly: (markdown) => commonmarkParser.parse(markdown),
};

const micromarkCandidate: Candidate = {
  name: 'micromark + mdast',
  packages: ['micromark', 'mdast-util-from-markdown', 'micromark-extension-gfm', 'mdast-util-gfm'],
  // The specification's HTML examples pass raw HTML through; micromark
  // sanitises it unless told not to, which is a rendering choice, not parsing.
  renderCommonMark: (markdown) => micromark(markdown, { allowDangerousHtml: true }),
  renderGfm: (markdown) =>
    micromark(markdown, {
      allowDangerousHtml: true,
      extensions: [gfm()],
      htmlExtensions: [gfmHtml()],
    }),
  blocks: (markdown) => {
    const blocks: ReportedBlock[] = [];
    for (const node of fromMarkdown(markdown).children) {
      const position = node.position;
      if (position === undefined) {
        continue;
      }
      if (node.type === 'heading') {
        blocks.push({
          kind: 'heading',
          startLine: position.start.line,
          endLine: position.end.line,
          level: node.depth,
        });
      } else if (node.type === 'code') {
        blocks.push({
          kind: 'code',
          startLine: position.start.line,
          endLine: position.end.line,
          level: null,
        });
      }
    }
    return blocks;
  },
  parseOnly: (markdown) => fromMarkdown(markdown),
};

const candidates: readonly Candidate[] = [markdownIt, markedCandidate, commonmarkJs, micromarkCandidate];

// --- the specification examples ---------------------------------------------

async function loadSpec(): Promise<readonly SpecExample[]> {
  mkdirSync(buildDirectory, { recursive: true });
  const cached = join(buildDirectory, 'spec.json');
  let bytes: Buffer;
  if (existsSync(cached) && sha256(readFileSync(cached)) === SPEC_SHA256) {
    bytes = readFileSync(cached);
  } else {
    console.log(`spike: fetching ${SPEC_URL}`);
    const response = await fetch(SPEC_URL);
    if (!response.ok) {
      throw new Error(`fetching the specification failed: ${response.status}`);
    }
    bytes = Buffer.from(await response.arrayBuffer());
    const hash = sha256(bytes);
    if (hash !== SPEC_SHA256) {
      throw new Error(`the specification's hash is ${hash}, expected ${SPEC_SHA256}`);
    }
    writeFileSync(cached, bytes);
  }
  return JSON.parse(bytes.toString('utf8')) as SpecExample[];
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * What the specification's own test runner normalises away: whitespace
 * between tags, the spelling of void elements, and the two ways of writing a
 * quote in an attribute.
 */
function normalizeHtml(html: string): string {
  return html
    .replace(/\r\n/gu, '\n')
    .replace(/>\s+</gu, '><')
    .replace(/\s*\/>/gu, '>')
    .replace(/&quot;/gu, '"')
    .replace(/&#39;/gu, "'")
    .replace(/&#x27;/gu, "'")
    .trim();
}

// --- criteria ---------------------------------------------------------------

interface Verdict {
  readonly candidate: string;
  readonly passed: boolean;
  readonly measurement: string;
}

function criterionConformance(spec: readonly SpecExample[]): Verdict[] {
  return candidates.map((candidate) => {
    const failures: number[] = [];
    for (const example of spec) {
      let html: string;
      try {
        html = candidate.renderCommonMark(example.markdown);
      } catch {
        failures.push(example.example);
        continue;
      }
      if (normalizeHtml(html) !== normalizeHtml(example.html)) {
        failures.push(example.example);
        if (process.env['SPIKE_DETAIL'] !== undefined && failures.length <= 3) {
          console.log(
            `detail ${candidate.name} example ${example.example}:\n  markdown ${JSON.stringify(example.markdown)}\n  expected ${JSON.stringify(normalizeHtml(example.html))}\n  got      ${JSON.stringify(normalizeHtml(html))}`,
          );
        }
      }
    }
    const passed = failures.length === 0;
    const rate = (((spec.length - failures.length) / spec.length) * 100).toFixed(1);
    const detail = passed ? '' : `; failing examples ${failures.slice(0, 12).join(', ')}${failures.length > 12 ? ', …' : ''}`;
    return {
      candidate: candidate.name,
      passed,
      measurement: `${spec.length - failures.length}/${spec.length} (${rate} %)${detail}`,
    };
  });
}

function criterionPositions(): Verdict[] {
  const sample = '# Title\n\ntext\n\n```\ncode\n```\n\n    indented\n';
  return candidates.map((candidate) => {
    const blocks = candidate.blocks(sample);
    if (blocks === null) {
      return {
        candidate: candidate.name,
        passed: false,
        measurement: 'no positions; lines only by adding up the tokens’ raw text',
      };
    }
    const heading = blocks.find((block) => block.kind === 'heading');
    const codes = blocks.filter((block) => block.kind === 'code');
    const passed =
      heading?.startLine === 1 && codes[0]?.startLine === 5 && codes[1]?.startLine === 9;
    return {
      candidate: candidate.name,
      passed,
      measurement: `heading at ${heading?.startLine}, code at ${codes.map((code) => code.startLine).join(' and ')}`,
    };
  });
}

const ATX = /^ {0,3}#{1,6}(?:[ \t]|$)/u;
const SECTIONS = ['ATX headings', 'Fenced code blocks', 'Indented code blocks', 'Setext headings'];

interface Disagreement {
  readonly example: number;
  readonly what: string;
}

function disagreementsFor(
  blocksOf: (markdown: string) => readonly ReportedBlock[],
  examples: readonly SpecExample[],
): Disagreement[] {
  const found: Disagreement[] = [];
  for (const example of examples) {
    const lines = example.markdown.split('\n');
    // Every example ends with a newline; the empty string after it is not a
    // line of the document, and an unclosed fence would otherwise mark it.
    if (lines[lines.length - 1] === '') {
      lines.pop();
    }
    const display = markdownToDisplay(example.markdown).slice(0, lines.length);
    const coreHeadings = new Map<number, number>();
    display.forEach((line, index) => {
      if (line.level !== null) {
        coreHeadings.set(index + 1, line.level);
      }
    });
    const parserBlocks = blocksOf(example.markdown);
    const parserHeadings = new Map<number, number>();
    for (const block of parserBlocks) {
      if (block.kind === 'heading' && ATX.test(lines[block.startLine - 1] ?? '')) {
        parserHeadings.set(block.startLine, block.level ?? 0);
      }
    }
    for (const [line, level] of coreHeadings) {
      if (parserHeadings.get(line) !== level) {
        found.push({
          example: example.example,
          what: `core: line ${line} is H${level}; parser: ${parserHeadings.has(line) ? `H${parserHeadings.get(line)}` : 'no heading'} — ${JSON.stringify(lines[line - 1])}`,
        });
      }
    }
    for (const [line, level] of parserHeadings) {
      if (!coreHeadings.has(line)) {
        found.push({
          example: example.example,
          what: `parser: line ${line} is H${level}; core: no heading — ${JSON.stringify(lines[line - 1])}`,
        });
      }
    }
    const codeRanges = parserBlocks.filter((block) => block.kind === 'code');
    display.forEach((line, index) => {
      const number = index + 1;
      if (
        line.verbatim &&
        !codeRanges.some((range) => number >= range.startLine && number <= range.endLine)
      ) {
        found.push({
          example: example.example,
          what: `core: line ${number} verbatim; parser: no code block there — ${JSON.stringify(lines[index])}`,
        });
      }
    });
  }
  return found;
}

function criterionAgreement(spec: readonly SpecExample[]): Verdict[] {
  const examples = spec.filter((example) => SECTIONS.includes(example.section));
  return candidates.map((candidate) => {
    const blocksOf = candidate.blocks(examples[0]?.markdown ?? '') === null
      ? markedDerivedBlocks
      : (markdown: string) => candidate.blocks(markdown) ?? [];
    const found = disagreementsFor(blocksOf, examples);
    const shown = found.slice(0, 20).map((d) => `\n      example ${d.example}: ${d.what}`).join('');
    return {
      candidate: candidate.name,
      passed: found.length === 0,
      measurement: `${examples.length} examples, ${found.length} disagreement(s)${shown}${found.length > 20 ? '\n      …' : ''}`,
    };
  });
}

function criterionGfm(): Verdict[] {
  const table = '| a | b |\n| - | - |\n| 1 | 2 |\n';
  const strike = 'a ~~gone~~ b\n';
  const task = '- [ ] open\n- [x] done\n';
  return candidates.map((candidate) => {
    const has = {
      table: candidate.renderGfm(table).includes('<table'),
      strikethrough: /<(del|s)>/u.test(candidate.renderGfm(strike)),
      task: candidate.renderGfm(task).includes('type="checkbox"'),
    };
    const passed = has.table && has.strikethrough && has.task;
    return {
      candidate: candidate.name,
      passed,
      measurement: `table ${yesNo(has.table)}, strikethrough ${yesNo(has.strikethrough)}, task list ${yesNo(has.task)}`,
    };
  });
}

function yesNo(value: boolean): string {
  return value ? 'yes' : 'no';
}

interface InstalledPackage {
  readonly name: string;
  readonly version: string;
  readonly path: string;
  readonly dependencies?: Record<string, InstalledPackage>;
}

const ACCEPTED_LICENSES = /^(MIT|ISC|BSD-2-Clause|BSD-3-Clause|Apache-2\.0|0BSD)$/u;

function criterionFootprint(): Verdict[] {
  const pnpmCli = process.env['npm_execpath'];
  if (pnpmCli === undefined) {
    throw new Error('Run this comparison through pnpm run spike:parser');
  }
  const listed = JSON.parse(
    execFileSync(process.execPath, [pnpmCli, 'list', '--json', '--depth', 'Infinity', '--dev'], {
      cwd: here,
      encoding: 'utf8',
    }),
  ) as Array<{ name: string; devDependencies?: Record<string, InstalledPackage> }>;
  // Inside a workspace the listing covers every project; this spike is one.
  const top =
    listed.find((project) => project.name === '@opera-incerta/spike-parser-markdown')
      ?.devDependencies ?? {};
  const lockfile = readFileSync(join(repositoryRoot, 'pnpm-lock.yaml'), 'utf8');

  return candidates.map((candidate) => {
    const closure = new Map<string, InstalledPackage>();
    // The listing keys dependencies by name and does not repeat it inside.
    const visit = (name: string, pkg: InstalledPackage): void => {
      const key = `${name}@${pkg.version}`;
      if (closure.has(key)) {
        return;
      }
      closure.set(key, pkg);
      for (const [childName, child] of Object.entries(pkg.dependencies ?? {})) {
        visit(childName, child);
      }
    };
    for (const name of candidate.packages) {
      const pkg = top[name];
      if (pkg === undefined) {
        throw new Error(`${name} is not installed in the spike`);
      }
      visit(name, pkg);
    }
    let kilobytes = 0;
    const licenses = new Set<string>();
    const badLicenses: string[] = [];
    const exotic: string[] = [];
    for (const [key, pkg] of closure) {
      kilobytes += directorySize(pkg.path);
      const manifest = JSON.parse(readFileSync(join(pkg.path, 'package.json'), 'utf8')) as {
        license?: string | { type?: string };
      };
      const license =
        typeof manifest.license === 'string' ? manifest.license : (manifest.license?.type ?? 'unknown');
      licenses.add(license);
      if (!ACCEPTED_LICENSES.test(license)) {
        badLicenses.push(`${key} (${license})`);
      }
      if (!resolvedFromRegistry(lockfile, key)) {
        exotic.push(key);
      }
    }
    const passed = closure.size <= 10 && badLicenses.length === 0 && exotic.length === 0;
    return {
      candidate: candidate.name,
      passed,
      measurement:
        `${closure.size} package(s), ${Math.round(kilobytes / 1024)} MB unpacked, licenses ${[...licenses].join(', ')}` +
        (badLicenses.length > 0 ? `; unaccepted: ${badLicenses.join(', ')}` : '') +
        (exotic.length > 0 ? `; not from the registry: ${exotic.join(', ')}` : ''),
    };
  });
}

function directorySize(path: string): number {
  // Logical file bytes, not filesystem allocation blocks; do not follow links
  // into other packages (their bytes are counted by the dependency closure).
  let bytes = 0;
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) bytes += directorySize(child) * 1024;
    else if (entry.isFile()) bytes += statSync(child).size;
  }
  return bytes / 1024;
}

/** Whether the lockfile resolved this package from the registry, by integrity. */
function resolvedFromRegistry(lockfile: string, key: string): boolean {
  // Scoped package keys are quoted by pnpm; checkout line endings vary by host.
  const normalized = lockfile.replaceAll('\r\n', '\n');
  const index = [key, `'${key}'`, `"${key}"`]
    .map((candidate) => normalized.indexOf(`\n  ${candidate}:\n`))
    .find((position) => position !== -1) ?? -1;
  if (index === -1) {
    return false;
  }
  const end = normalized.indexOf('\n\n', index);
  const resolution = normalized.slice(index, end === -1 ? undefined : end);
  return resolution.includes('resolution: {integrity:') && !resolution.includes('tarball:');
}

function criterionParseTime(spec: readonly SpecExample[]): Verdict[] {
  let document = '';
  while (document.length < 100_000) {
    for (const example of spec) {
      document += `${example.markdown}\n\n`;
    }
  }
  return candidates.map((candidate) => {
    const times: number[] = [];
    for (let run = 0; run < 20; run += 1) {
      const started = performance.now();
      candidate.parseOnly(document);
      times.push(performance.now() - started);
    }
    times.sort((left, right) => left - right);
    const median = times[Math.floor(times.length / 2)] ?? 0;
    return {
      candidate: candidate.name,
      passed: median < 50,
      measurement: `${document.length} characters: median ${median.toFixed(1)} ms, max ${times[times.length - 1]?.toFixed(1)} ms`,
    };
  });
}

// --- criterion 7: the front matter the codec writes is YAML ------------------

const AWKWARD_SCALARS: readonly string[] = [
  'Plain title',
  'Title: with a colon',
  '# looks like a comment',
  '- looks like a list',
  'yes',
  'no',
  'true',
  'null',
  '~',
  '123',
  '1e3',
  '0x1F',
  '3.14',
  '',
  ' leading and trailing ',
  'tab\there',
  'line\nbreak',
  'literal \\n backslash',
  'a "quote" inside',
  "it's",
  '{not: a mapping}',
  '[not, a, list]',
  '*star',
  '&anchor',
  '!tag',
  '%directive',
  '@at',
  '`tick',
  '| pipe',
  '> fold',
  'Größe und Café — “quotes” 🌊',
  '---',
  '...',
  'key: value: nested',
  'trailing colon:',
  'a #comment',
];

function sheetWith(metadata: SheetMetadata): Sheet {
  return { metadata, unknownOwnedLines: [], foreignLines: [], body: 'Body.\n', lineEnding: '\n' };
}

function frontMatterOf(text: string): string {
  const lines = text.split('\n');
  if (lines[0] !== '---') {
    throw new Error('no front matter written');
  }
  const end = lines.indexOf('---', 1);
  return lines.slice(1, end).join('\n');
}

function isStringTree(value: unknown): boolean {
  if (typeof value === 'string') {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every(isStringTree);
  }
  if (typeof value === 'object' && value !== null) {
    return Object.values(value).every(isStringTree);
  }
  return false;
}

function criterionYaml(): Verdict {
  const problems: string[] = [];
  const sheets: SheetMetadata[] = AWKWARD_SCALARS.flatMap((scalar) => [
    { title: scalar },
    { topic: scalar, status: scalar, category: scalar },
    { keywords: [scalar, 'plain'] },
    { notes: scalar },
    { notes: `${scalar}\n\n  indented after a blank\n${scalar}` },
  ]);
  sheets.push({
    title: 'Everything',
    topic: 'all fields',
    keywords: ['a', 'b: c', ''],
    status: 'draft',
    category: 'Scene',
    notes: 'first\nsecond\n',
  });
  for (const metadata of sheets) {
    const written = serializeSheet(sheetWith(metadata));
    let parsed: unknown;
    try {
      parsed = parseYaml(frontMatterOf(written));
    } catch (error: unknown) {
      problems.push(`${JSON.stringify(metadata)}: yaml refuses — ${String(error).split('\n')[0]}`);
      continue;
    }
    const owned = (parsed as Record<string, unknown> | null)?.['opera-incerta'];
    if (JSON.stringify(owned) !== JSON.stringify(metadata)) {
      problems.push(`${JSON.stringify(metadata)}: yaml reads ${JSON.stringify(owned)}`);
    } else if (!isStringTree(owned)) {
      problems.push(`${JSON.stringify(metadata)}: yaml reads a non-string`);
    }
    const back = parseSheet(written);
    if (JSON.stringify(back.sheet.metadata) !== JSON.stringify(metadata) || !back.writable) {
      problems.push(`${JSON.stringify(metadata)}: the codec itself reads ${JSON.stringify(back.sheet.metadata)}`);
    }
  }

  const fixtures = join(repositoryRoot, 'examples', 'foreign-front-matter');
  let fixtureCount = 0;
  for (const name of readdirSync(fixtures).filter((entry) => entry.endsWith('.md'))) {
    fixtureCount += 1;
    const original = readFileSync(join(fixtures, name), 'utf8');
    const written = serializeSheet(parseSheet(original).sheet);
    try {
      const before = parseYaml(frontMatterOf(original)) as Record<string, unknown>;
      const after = parseYaml(frontMatterOf(written)) as Record<string, unknown>;
      delete before['opera-incerta'];
      delete after['opera-incerta'];
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        problems.push(`${name}: foreign keys differ after a round trip`);
      }
    } catch (error: unknown) {
      problems.push(`${name}: yaml refuses — ${String(error).split('\n')[0]}`);
    }
  }
  return {
    candidate: 'yaml',
    passed: problems.length === 0,
    measurement:
      `${sheets.length} generated sheets and ${fixtureCount} fixtures` +
      (problems.length > 0 ? `; ${problems.length} problem(s):${problems.slice(0, 30).map((p) => `\n      ${p}`).join('')}` : ''),
  };
}

// --- the run ----------------------------------------------------------------

function printTable(title: string, verdicts: readonly Verdict[]): void {
  console.log(`\n${title}`);
  for (const verdict of verdicts) {
    console.log(`  ${verdict.passed ? 'pass' : 'FAIL'}  ${verdict.candidate.padEnd(18)} ${verdict.measurement}`);
  }
}

async function run(): Promise<number> {
  const spec = await loadSpec();
  console.log(`spike: ${spec.length} specification examples, hash verified`);

  const results: Array<readonly Verdict[]> = [
    criterionConformance(spec),
    criterionPositions(),
    criterionAgreement(spec),
    criterionGfm(),
    criterionFootprint(),
    criterionParseTime(spec),
  ];
  const titles = [
    '1. CommonMark conformance (all examples)',
    '2. Source positions (heading 1, code 5 and 9)',
    '3. Agreement with the core on top-level headings and code',
    '4. GFM: tables, strikethrough, task lists',
    '5. Footprint (≤ 10 packages, accepted licenses, registry only)',
    '6. Parse time (< 50 ms median, ≥ 100,000 characters)',
  ];
  results.forEach((verdicts, index) => printTable(titles[index] ?? '', verdicts));

  const yaml = criterionYaml();
  printTable('7. The front matter the codec writes is YAML', [yaml]);

  console.log('\nVerdict');
  let anyPassed = false;
  for (const candidate of candidates) {
    const failed = results
      .map((verdicts, index) => (verdicts.find((v) => v.candidate === candidate.name)?.passed ? null : index + 1))
      .filter((index): index is number => index !== null);
    const passed = failed.length === 0;
    anyPassed ||= passed;
    console.log(`  ${passed ? 'passes' : 'fails '}  ${candidate.name.padEnd(18)} ${passed ? 'every criterion' : `criteria ${failed.join(', ')}`}`);
  }
  console.log(`  ${yaml.passed ? 'passes' : 'fails '}  ${'yaml'.padEnd(18)} criterion 7`);
  return anyPassed && yaml.passed ? 0 : 1;
}

run().then(
  (code) => {
    console.log(code === 0 ? '\nspike ok' : '\nspike failed');
    process.exit(code);
  },
  (error: unknown) => {
    console.error('spike failed:', error);
    process.exit(1);
  },
);
