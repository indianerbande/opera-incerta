/**
 * Access to the desktop bridge from the renderer. SPEC.md §5.3.
 *
 * The renderer validates what comes back. Not because the main process is
 * suspect, but because "the other side promised" is not a check, and a bridge
 * that changes shape should fail at the boundary rather than three components
 * later.
 */
import { InjectionToken } from '@angular/core';
import {
  BRIDGE_GLOBAL,
  isProjectSnapshot,
  type BridgeResult,
  type OperaIncertaBridge,
  type ProjectSnapshot,
} from '@opera-incerta/desktop-contract';

export const DESKTOP_BRIDGE = new InjectionToken<OperaIncertaBridge | null>('desktop bridge');

/** The bridge, or null in the development harness where there is no shell. */
export function resolveBridge(): OperaIncertaBridge | null {
  const candidate = (globalThis as Record<string, unknown>)[BRIDGE_GLOBAL];
  return typeof candidate === 'object' && candidate !== null
    ? (candidate as OperaIncertaBridge)
    : null;
}

/** A failure the interface can report, with the code the main process sent. */
export class BridgeFailure extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'BridgeFailure';
    this.code = code;
  }
}

/**
 * Whatever was thrown, as a failure with a code and a message.
 *
 * The one place that looks inside an unknown error. A `BridgeFailure` comes
 * back as it is; anything else that carries a `code` or a `message` is read
 * for them; the rest is `bridge/failed`. Every store and component used to
 * duck-type this for itself, and the three copies disagreed about which field
 * to prefer.
 */
export function toBridgeFailure(error: unknown): BridgeFailure {
  if (error instanceof BridgeFailure) {
    return error;
  }
  const candidate =
    typeof error === 'object' && error !== null
      ? (error as { code?: unknown; message?: unknown })
      : {};
  const code = typeof candidate.code === 'string' ? candidate.code : 'bridge/failed';
  const message =
    typeof candidate.message === 'string'
      ? candidate.message
      : typeof error === 'string'
        ? error
        : '';
  return new BridgeFailure(code, message);
}

/** Unwraps a result, turning a reported failure into a typed error. */
export function unwrap<T>(result: BridgeResult<T>): T {
  if (!result.ok) {
    throw new BridgeFailure(result.code, result.message);
  }
  return result.value;
}

/** Unwraps a snapshot and checks its shape before it enters the interface. */
export function unwrapSnapshot(
  result: BridgeResult<ProjectSnapshot | null>,
): ProjectSnapshot | null {
  const value = unwrap(result);
  if (value === null) {
    return null;
  }
  if (!isProjectSnapshot(value)) {
    throw new BridgeFailure('bridge/malformed-snapshot', 'the project snapshot is malformed');
  }
  return value;
}
