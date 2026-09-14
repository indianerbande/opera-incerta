import { describe, expect, it } from 'vitest';
import {
  CHANNELS,
  CONTRACT_VERSION,
  MAX_DOCUMENT_BYTES,
  isBuildIdentity,
  isChannelName,
  isDocumentHandle,
  isGitReport,
  isLibraryEditResult,
  isProjectSnapshot,
  isGitPathsRequest,
  isGitResolveRequest,
  isLibraryEditRequest,
  isLibraryPathRequest,
  isLibraryPlaceRequest,
  isProjectOpenOutcome,
  isProjectPathRequest,
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

describe('isBuildIdentity', () => {
  it('accepts what git describe writes, a build without a revision, and an unreadable record', () => {
    expect(isBuildIdentity({ version: '0.1.0-beta.1', revision: 'v0.1.0-beta.1-7-g0381bfe' })).toBe(true);
    expect(isBuildIdentity({ version: '0.1.0-beta.1', revision: 'v0.1.0-beta.1-7-g0381bfe-dirty' })).toBe(true);
    expect(isBuildIdentity({ version: '0.1.0-beta.1', revision: '0381bfe' })).toBe(true);
    expect(isBuildIdentity({ version: '0.1.0-beta.1', revision: null })).toBe(true);
    expect(isBuildIdentity({ version: null, revision: null })).toBe(true);
  });

  it('refuses a record that is not a build identity', () => {
    expect(isBuildIdentity({ version: '0.1.0-beta.1' })).toBe(false);
    expect(isBuildIdentity({ version: '', revision: null })).toBe(false);
    expect(isBuildIdentity({ version: '0.1.0', revision: '<b>v1</b>' })).toBe(false);
    expect(isBuildIdentity({ version: '0.1.0', revision: 'v1 and more' })).toBe(false);
    expect(isBuildIdentity({ version: '0.1.0', revision: 'v'.repeat(101) })).toBe(false);
    expect(isBuildIdentity({ version: 1, revision: null })).toBe(false);
    expect(isBuildIdentity('v0.1.0-beta.1')).toBe(false);
    expect(isBuildIdentity(null)).toBe(false);
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

describe('isProjectPathRequest', () => {
  it('accepts a path and refuses an empty or missing one', () => {
    expect(isProjectPathRequest({ path: '/books/novel' })).toBe(true);
    expect(isProjectPathRequest({ path: '' })).toBe(false);
    expect(isProjectPathRequest({})).toBe(false);
    expect(isProjectPathRequest(null)).toBe(false);
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
    // specification.md §5.3: a request that looks like traversal is refused, not fixed.
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

describe('what comes back is checked too', () => {
  const library = { kind: 'group', name: '', relativePath: '.', displayName: 'B', children: [] };
  const snapshot = {
    id: 'p',
    displayName: 'B',
    library,
    handles: {},
    categories: [],
    recentSheets: [],
  };

  it('accepts a snapshot with a group at its root, and refuses one without', () => {
    expect(isProjectSnapshot(snapshot)).toBe(true);
    expect(isProjectSnapshot({ ...snapshot, library: { kind: 'sheet' } })).toBe(false);
    expect(isProjectSnapshot({ ...snapshot, library: null })).toBe(false);
    expect(isProjectSnapshot({ ...snapshot, categories: 'none' })).toBe(false);
    expect(isProjectSnapshot({ ...snapshot, recentSheets: [1] })).toBe(false);
  });

  it('checks an open outcome by the kind it claims', () => {
    expect(isProjectOpenOutcome({ kind: 'opened', snapshot })).toBe(true);
    expect(isProjectOpenOutcome({ kind: 'cancelled' })).toBe(true);
    expect(
      isProjectOpenOutcome({ kind: 'no-project', path: '/b/m', shortPath: '~/b/m', folderName: 'm' }),
    ).toBe(true);
    expect(
      isProjectOpenOutcome({ kind: 'single-subproject', path: '/b/s/n', shortPath: '~/b/s', name: 'n' }),
    ).toBe(true);
    expect(isProjectOpenOutcome({ kind: 'multiple-subprojects', shortPath: '~/b/s', names: ['a'] })).toBe(
      true,
    );

    // A kind that carries the wrong payload is the shape that would otherwise
    // reach the launcher as a question with nothing to act on.
    expect(isProjectOpenOutcome({ kind: 'opened' })).toBe(false);
    expect(isProjectOpenOutcome({ kind: 'opened', snapshot: {} })).toBe(false);
    expect(isProjectOpenOutcome({ kind: 'no-project', path: '', shortPath: '', folderName: 'm' })).toBe(
      false,
    );
    expect(isProjectOpenOutcome({ kind: 'multiple-subprojects', shortPath: '~/b', names: [''] })).toBe(
      false,
    );
    expect(isProjectOpenOutcome({ kind: 'adopted' })).toBe(false);
    expect(isProjectOpenOutcome(null)).toBe(false);
  });

  it('checks a library edit result down to its snapshot', () => {
    expect(isLibraryEditResult({ snapshot, revealPath: null })).toBe(true);
    expect(isLibraryEditResult({ snapshot, revealPath: 'a.md' })).toBe(true);
    expect(isLibraryEditResult({ snapshot: {}, revealPath: null })).toBe(false);
    expect(isLibraryEditResult({ snapshot })).toBe(false);
  });

  it('checks a git report field by field', () => {
    const report = {
      root: null,
      entries: [],
      tracking: null,
      merging: false,
      hasCommit: false,
      branch: null,
      remote: null,
    };
    expect(isGitReport(report)).toBe(true);
    expect(
      isGitReport({
        ...report,
        root: '/r',
        tracking: { upstream: 'origin/main', ahead: 1, behind: 0 },
        remote: { name: 'origin', url: 'x' },
      }),
    ).toBe(true);
    expect(isGitReport({ ...report, merging: 'no' })).toBe(false);
    expect(isGitReport({ ...report, tracking: { upstream: 'o' } })).toBe(false);
    expect(isGitReport({ ...report, entries: 'many' })).toBe(false);
  });
});
