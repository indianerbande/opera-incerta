import { describe, expect, it } from 'vitest';
import type { GitFileStatus, GitService } from '../src/index.js';

describe('GitService port', () => {
  it('reports paths relative to the repository root', async () => {
    const entry: GitFileStatus = {
      path: 'chapters/intro.md',
      indexStatus: 'M',
      worktreeStatus: ' ',
      groups: ['staged'],
    };
    const double: Pick<GitService, 'status'> = {
      status: async () => [entry],
    };

    const result = await double.status('/repo');
    expect(result[0]?.path).toBe('chapters/intro.md');
    expect(result[0]?.path.startsWith('/')).toBe(false);
  });

  it('accepts batch staging, so one guard covers the whole action', async () => {
    const staged: string[][] = [];
    const double: Pick<GitService, 'stage'> = {
      stage: async (_root, paths) => {
        staged.push([...paths]);
      },
    };

    await double.stage('/repo', ['a.md', 'b.md']);
    expect(staged).toEqual([['a.md', 'b.md']]);
  });
});
