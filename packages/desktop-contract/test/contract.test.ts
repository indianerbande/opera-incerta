import { describe, expect, it } from 'vitest';
import {
  CHANNELS,
  CONTRACT_VERSION,
  MAX_DOCUMENT_BYTES,
  isChannelName,
  isDocumentHandle,
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
