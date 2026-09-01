/**
 * The owned local protocol that serves the renderer. SPEC.md §5.3.
 *
 * `loadFile` would give the renderer a `file://` origin, where relative
 * requests can walk the whole disk. A custom scheme with an explicit root and
 * a containment check makes traversal impossible by construction rather than
 * by review.
 *
 * The resolution rule is a pure function so that traversal attempts can be
 * tested without launching Electron (TESTING.md §2.7).
 */
import { posix } from 'node:path';
import { resolve, sep } from 'node:path';

/** Scheme this application serves its renderer from. */
export const RENDERER_SCHEME = 'opera-incerta';

/** Host segment of every renderer URL. */
export const RENDERER_HOST = 'app';

/** Entry document served for the root and for unknown routes. */
export const RENDERER_INDEX = 'index.html';

/** The URL the project window loads. */
export const RENDERER_ENTRY_URL = `${RENDERER_SCHEME}://${RENDERER_HOST}/${RENDERER_INDEX}`;

/**
 * Traversal shapes that are refused outright: a `..` path segment, its
 * percent-encoded spelling, an encoded path separator, and a NUL byte.
 */
const SUSPICIOUS_REQUEST = /(?:^|[/\\])\.\.(?:[/\\]|$)|%2e%2e|%2f|%5c|%00/i;

/**
 * Maps a renderer request to a file inside `root`, or null when it must be
 * refused.
 *
 * Refused: a foreign scheme, a foreign host, and any path that escapes the
 * root — whether through `..`, an absolute path, a URL-encoded separator, or a
 * NUL byte.
 */
export function resolveRendererAsset(root: string, requestUrl: string): string | null {
  // Checked against the raw request, before `URL` sees it. WHATWG URL resolves
  // `..` inside a path on its own, so by the time the parsed pathname is read,
  // `/../secret.txt` has quietly become `/secret.txt`: contained, but a
  // different file than the one requested. A traversal attempt is refused, not
  // corrected.
  if (SUSPICIOUS_REQUEST.test(requestUrl)) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return null;
  }

  if (url.protocol !== `${RENDERER_SCHEME}:` || url.hostname !== RENDERER_HOST) {
    return null;
  }

  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }

  if (pathname.includes('\0')) {
    return null;
  }

  // Normalize with POSIX rules first: a URL path uses forward slashes on every
  // platform, and normalizing before joining collapses `..` before it can be
  // interpreted against the filesystem root.
  const normalized = posix.normalize(pathname);
  if (normalized.startsWith('/..')) {
    return null;
  }

  const relative = normalized.replace(/^\/+/, '');
  const target = resolve(root, relative === '' ? RENDERER_INDEX : relative);
  const rootWithSeparator = resolve(root) + sep;

  if (target !== resolve(root) && !target.startsWith(rootWithSeparator)) {
    return null;
  }
  return target;
}
