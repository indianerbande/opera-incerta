import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  RENDERER_ENTRY_URL,
  RENDERER_HOST,
  RENDERER_SCHEME,
  resolveRendererAsset,
} from '../src/renderer-protocol.js';

const ROOT = resolve('/tmp/opera-incerta-renderer');
const url = (path: string): string => `${RENDERER_SCHEME}://${RENDERER_HOST}${path}`;

describe('resolveRendererAsset', () => {
  it('serves the entry document for the root path', () => {
    expect(resolveRendererAsset(ROOT, url('/'))).toBe(resolve(ROOT, 'index.html'));
  });

  it('serves a normal asset', () => {
    expect(resolveRendererAsset(ROOT, url('/main.js'))).toBe(resolve(ROOT, 'main.js'));
    expect(resolveRendererAsset(ROOT, url('/assets/fonts/a.woff2'))).toBe(
      resolve(ROOT, 'assets/fonts/a.woff2'),
    );
  });

  it('ignores a query string and a fragment', () => {
    expect(resolveRendererAsset(ROOT, url('/main.js?v=2#top'))).toBe(resolve(ROOT, 'main.js'));
  });

  it('resolves the entry URL the window loads', () => {
    expect(resolveRendererAsset(ROOT, RENDERER_ENTRY_URL)).toBe(resolve(ROOT, 'index.html'));
  });

  describe('refuses to escape the root', () => {
    const attempts = [
      ['parent traversal', '/../secret.txt'],
      ['deep traversal', '/../../../../etc/passwd'],
      ['traversal through a subdirectory', '/assets/../../secret.txt'],
      ['encoded traversal', '/%2e%2e/secret.txt'],
      ['encoded separator traversal', '/..%2Fsecret.txt'],
      ['double-encoded traversal', '/%252e%252e/secret.txt'],
      ['NUL byte', '/index.html%00.png'],
    ] as const;

    for (const [name, path] of attempts) {
      it(name, () => {
        const resolved = resolveRendererAsset(ROOT, url(path));
        if (resolved !== null) {
          // A refusal is preferred, but containment is the actual requirement.
          expect(resolved.startsWith(`${ROOT}/`)).toBe(true);
        }
      });
    }

    it('rejects an outright traversal rather than clamping it', () => {
      expect(resolveRendererAsset(ROOT, url('/../secret.txt'))).toBeNull();
      expect(resolveRendererAsset(ROOT, url('/%2e%2e/secret.txt'))).toBeNull();
      expect(resolveRendererAsset(ROOT, url('/index.html%00.png'))).toBeNull();
    });
  });

  it('refuses a foreign scheme', () => {
    expect(resolveRendererAsset(ROOT, `file://${RENDERER_HOST}/index.html`)).toBeNull();
    expect(resolveRendererAsset(ROOT, 'https://example.com/index.html')).toBeNull();
  });

  it('refuses a foreign host', () => {
    expect(resolveRendererAsset(ROOT, `${RENDERER_SCHEME}://evil/index.html`)).toBeNull();
  });

  it('refuses input that is not a URL at all', () => {
    expect(resolveRendererAsset(ROOT, 'not a url')).toBeNull();
    expect(resolveRendererAsset(ROOT, '')).toBeNull();
  });
});
