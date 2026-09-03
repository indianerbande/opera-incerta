import { describe, expect, it } from 'vitest';
import {
  CHANNELS,
  CONTRACT_VERSION,
  MAX_DOCUMENT_BYTES,
  isChannelName,
  isDocumentHandle,
  isGitPathsRequest,
  isGitResolveRequest,
  isLibraryEditRequest,
  isLibraryPathRequest,
  isLibraryPlaceRequest,
  isRelativeEntryPath,
  isWatchTargetsRequest,
  isWriteSheetRequest,
} from '../src/index.js';

const validHandle = { kind: 'opera-incerta/document', id: 'a'.repeat(32) } as const;

describe('channel inventory', () => {
  it('accepts declared channels and rejects everything else', () => {
    expect(isChannelName(CHANNELS.readSheet)).toBe(true);
    expect(isChannelName('opera-incerta:sheet/delete')).toBe(false);
    expect(isChannelName(42)).toBe(false);
  });

  it('namespaces every channel', () => {
    for (const channel of Object.values(CHANNELS)) {
      expect(channel.startsWith('opera-incerta:')).toBe(true);
    }
  });

  it('has a positive integer version', () => {
    expect(Number.isInteger(CONTRACT_VERSION)).toBe(true);
    expect(CONTRACT_VERSION).toBeGreaterThan(0);
  });
});

describe('isDocumentHandle', () => {
  it('accepts a well-formed handle', () => {
    expect(isDocumentHandle(validHandle)).toBe(true);
  });

  it('rejects forged, malformed, and non-object values', () => {
    expect(isDocumentHandle({ kind: 'opera-incerta/document', id: 'short' })).toBe(false);
    expect(isDocumentHandle({ kind: 'other', id: 'a'.repeat(32) })).toBe(false);
    expect(isDocumentHandle({ id: 'a'.repeat(32) })).toBe(false);
    expect(isDocumentHandle('/Users/someone/book/chapter.md')).toBe(false);
    expect(isDocumentHandle(null)).toBe(false);
    expect(isDocumentHandle(undefined)).toBe(false);
  });
});

describe('isWriteSheetRequest', () => {
  it('accepts a handle plus text', () => {
    expect(isWriteSheetRequest({ handle: validHandle, text: '# Chapter' })).toBe(true);
  });

  it('rejects a missing or invalid handle', () => {
    expect(isWriteSheetRequest({ text: 'x' })).toBe(false);
    expect(isWriteSheetRequest({ handle: { kind: 'other', id: 'a' }, text: 'x' })).toBe(false);
  });

  it('rejects non-string text', () => {
    expect(isWriteSheetRequest({ handle: validHandle, text: 42 })).toBe(false);
  });

  it('enforces the document size limit in bytes, not characters', () => {
    const justUnder = 'a'.repeat(MAX_DOCUMENT_BYTES);
    expect(isWriteSheetRequest({ handle: validHandle, text: justUnder })).toBe(true);

    const multiByte = 'ä'.repeat(MAX_DOCUMENT_BYTES / 2 + 1);
    expect(isWriteSheetRequest({ handle: validHandle, text: multiByte })).toBe(false);
  });
});

describe('isLibraryPathRequest', () => {
  it('accepts an entry path', () => {
    expect(isLibraryPathRequest({ path: 'part-1/scene.md' })).toBe(true);
  });

  it('rejects the project root, an empty path, and a missing one', () => {
    // Deleting the root is not an operation, so it never reaches a handler.
    expect(isLibraryPathRequest({ path: '.' })).toBe(false);
    expect(isLibraryPathRequest({ path: '' })).toBe(false);
    expect(isLibraryPathRequest({})).toBe(false);
    expect(isLibraryPathRequest(null)).toBe(false);
  });
});

describe('isLibraryPlaceRequest', () => {
  it('accepts a group and a position within it, the end included', () => {
    expect(isLibraryPlaceRequest({ path: 'a.md', into: 'part-1', before: 'scene.md' })).toBe(true);
    expect(isLibraryPlaceRequest({ path: 'a.md', into: 'part-1', before: null })).toBe(true);
    expect(isLibraryPlaceRequest({ path: 'part-1', into: '.', before: null })).toBe(true);
  });

  it('rejects placing the root, an empty group, and a missing position', () => {
    expect(isLibraryPlaceRequest({ path: '.', into: 'part-1', before: null })).toBe(false);
    expect(isLibraryPlaceRequest({ path: 'a.md', into: '', before: null })).toBe(false);
    // `undefined` must not pass as "last": a typo would move the entry to the
    // bottom of its group.
    expect(isLibraryPlaceRequest({ path: 'a.md', into: 'part-1' })).toBe(false);
    expect(isLibraryPlaceRequest({ path: 'a.md', into: 'part-1', before: 3 })).toBe(false);
    expect(isLibraryPlaceRequest(null)).toBe(false);
  });
});

describe('isRelativeEntryPath', () => {
  it('accepts a path inside the root, and the root itself', () => {
    expect(isRelativeEntryPath('part-1/scene.md')).toBe(true);
    expect(isRelativeEntryPath('scene.md')).toBe(true);
    expect(isRelativeEntryPath('.')).toBe(true);
    // A name is not a traversal because it contains dots.
    expect(isRelativeEntryPath('notes..md')).toBe(true);
    expect(isRelativeEntryPath('..hidden/x.md')).toBe(true);
    // How git names an untracked directory; staging it is an ordinary request.
    expect(isRelativeEntryPath('part-1/')).toBe(true);
    expect(isRelativeEntryPath('part-1//')).toBe(false);
  });

  it('refuses every way out of the root rather than correcting it', () => {
    // SPEC.md §5.3: a request that looks like traversal is refused, not fixed.
    expect(isRelativeEntryPath('../secret.md')).toBe(false);
    expect(isRelativeEntryPath('part-1/../../secret.md')).toBe(false);
    expect(isRelativeEntryPath('part-1/..')).toBe(false);
    expect(isRelativeEntryPath('/etc/hosts')).toBe(false);
    expect(isRelativeEntryPath('\\\\server\\share')).toBe(false);
    expect(isRelativeEntryPath('C:\\Users\\someone')).toBe(false);
    expect(isRelativeEntryPath('part-1\\..\\secret.md')).toBe(false);
    expect(isRelativeEntryPath('%2e%2e/secret.md')).toBe(false);
    expect(isRelativeEntryPath('part-1%2Fsecret.md')).toBe(false);
    expect(isRelativeEntryPath('scene.md\0')).toBe(false);
  });

  it('refuses what is not a path at all', () => {
    expect(isRelativeEntryPath('')).toBe(false);
    expect(isRelativeEntryPath('part-1//scene.md')).toBe(false);
    expect(isRelativeEntryPath(42)).toBe(false);
    expect(isRelativeEntryPath(null)).toBe(false);
    expect(isRelativeEntryPath(undefined)).toBe(false);
  });
});

describe('every request that carries a path applies the one rule', () => {
  // One table, so a request type added without the rule is a missing row
  // that review can see, rather than a handler that quietly trusts its input.
  const escape = '../../etc/hosts';

  it('refuses traversal in library edits', () => {
    expect(isLibraryEditRequest({ path: 'part-1', name: 'Scene' })).toBe(true);
    expect(isLibraryEditRequest({ path: '.', name: 'Scene' })).toBe(true);
    expect(isLibraryEditRequest({ path: escape, name: 'Scene' })).toBe(false);
    expect(isLibraryEditRequest({ path: '/tmp', name: 'Scene' })).toBe(false);
  });

  it('refuses traversal in a single path', () => {
    expect(isLibraryPathRequest({ path: escape })).toBe(false);
    expect(isLibraryPathRequest({ path: '/etc/hosts' })).toBe(false);
  });

  it('refuses traversal in either half of a placement', () => {
    expect(isLibraryPlaceRequest({ path: escape, into: 'part-1', before: null })).toBe(false);
    expect(isLibraryPlaceRequest({ path: 'a.md', into: escape, before: null })).toBe(false);
  });

  it('refuses traversal in watch targets, and still takes null for nothing', () => {
    expect(isWatchTargetsRequest({ group: 'part-1', sheet: 'part-1/scene.md' })).toBe(true);
    expect(isWatchTargetsRequest({ group: null, sheet: null })).toBe(true);
    expect(isWatchTargetsRequest({ group: escape, sheet: null })).toBe(false);
    expect(isWatchTargetsRequest({ group: null, sheet: '/etc' })).toBe(false);
    expect(isWatchTargetsRequest({ group: '', sheet: null })).toBe(false);
  });

  it('refuses traversal in a resolution', () => {
    expect(isGitResolveRequest({ path: 'scene.md', text: 'x' })).toBe(true);
    expect(isGitResolveRequest({ path: escape, text: 'x' })).toBe(false);
  });

  it('refuses traversal anywhere in a batch of paths', () => {
    expect(isGitPathsRequest({ paths: ['a.md', 'part-1/b.md'] })).toBe(true);
    expect(isGitPathsRequest({ paths: [] })).toBe(true);
    expect(isGitPathsRequest({ paths: ['a.md', escape] })).toBe(false);
    expect(isGitPathsRequest({ paths: ['a.md', ''] })).toBe(false);
  });
});
