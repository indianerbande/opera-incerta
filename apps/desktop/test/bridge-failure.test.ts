import { describe, expect, it } from 'vitest';
import { CodedError } from '@opera-incerta/core';
import { failureResult } from '../src/bridge-failure.js';
import { ProjectSessionError } from '../src/project-session.js';

describe('what a failure becomes on the bridge', () => {
  it('lets a coded failure cross with its code and its words', () => {
    const logged: unknown[] = [];
    expect(
      failureResult(new CodedError('git/no-upstream', 'fatal: no push destination'), 'x', (m) =>
        logged.push(m),
      ),
    ).toEqual({ ok: false, code: 'git/no-upstream', message: 'fatal: no push destination' });
    expect(logged).toEqual([]);
  });

  it('lets a session refusal cross as its code', () => {
    const refusal = new ProjectSessionError('project/none-open');
    const result = failureResult(refusal, 'x', () => undefined);
    expect(result).toEqual({
      ok: false,
      code: 'project/none-open',
      message: 'project/none-open',
    });
  });

  it('strips the words from anything that was not meant for the renderer', () => {
    // The shape of a Node filesystem error: a code, and a path in the message.
    const node = Object.assign(new Error("ENOENT: no such file, open '/Users/someone/secret.md'"), {
      code: 'ENOENT',
    });
    const logged: unknown[] = [];
    const result = failureResult(node, 'opera-incerta:sheet/read', (message, cause) =>
      logged.push([message, cause]),
    );

    expect(result).toEqual({ ok: false, code: 'bridge/failed', message: '' });
    expect(JSON.stringify(result)).not.toContain('/Users');
    // Logged where it happened, so the trail is not lost — only not shown.
    expect(logged).toHaveLength(1);
    expect(logged[0]).toEqual(['unhandled failure on opera-incerta:sheet/read:', node]);
  });

  it('treats a thrown non-error the same way', () => {
    expect(failureResult('boom', 'x', () => undefined)).toEqual({
      ok: false,
      code: 'bridge/failed',
      message: '',
    });
  });
});
