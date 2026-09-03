/**
 * What a thrown error becomes on the bridge. SPEC.md §16.
 *
 * Only a failure that was *meant* for the renderer crosses with its words: a
 * `CodedError` carries a stable code and either the tool's own message or
 * none. Anything else — a Node error with an absolute path in its message, a
 * bug — is logged where it happened and crosses as a bare `bridge/failed`,
 * because a message that was never meant for the author must not reach them.
 *
 * Its own file, without Electron, so it is a unit test rather than a promise.
 */
import { CodedError } from '@opera-incerta/core';
import type { BridgeFailure } from '@opera-incerta/desktop-contract';

export function failureResult(
  error: unknown,
  channel: string,
  log: (message: string, error: unknown) => void = (message, cause) =>
    console.error(message, cause),
): BridgeFailure {
  if (error instanceof CodedError) {
    return { ok: false, code: error.code, message: error.message };
  }
  log(`unhandled failure on ${channel}:`, error);
  return { ok: false, code: 'bridge/failed', message: '' };
}
