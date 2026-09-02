import type { OperaIncertaBridge } from '@opera-incerta/desktop-contract';

/**
 * A bridge that satisfies the whole contract and does nothing interesting.
 *
 * Tests override the few methods they care about. Every test previously
 * carried its own complete double, so each new channel broke them all — the
 * shared-detail rule applies to test doubles too (`CONVENTIONS.md` C-U7).
 *
 * It is deliberately exhaustive rather than a partial cast: a channel added to
 * the contract and forgotten here fails to compile, which is the reminder.
 */
export function baseBridge(): OperaIncertaBridge {
  return {
    contractVersion: async () => 1,
    windowRole: async () => 'project',
    currentProject: async () => ({ ok: true, value: null }),
    recentProjects: async () => ({ ok: true, value: [] }),
    openRecentProject: async () => ({ ok: true, value: null }),
    forgetRecentProject: async () => ({ ok: true, value: null }),
    // Creating now returns a project rather than possibly nothing: the
    // location is chosen in a separate step, so there is no cancel here.
    createProject: async () => ({
      ok: false,
      code: 'test/not-scripted',
      message: 'this double does not create projects',
    }),
    chooseProjectLocation: async () => ({ ok: true, value: null }),
    openProject: async () => ({ ok: true, value: null }),
    reopenProject: async () => ({ ok: true, value: null }),
    closeProject: async () => ({ ok: true, value: null }),
    readSheet: async () => ({ ok: true, value: '' }),
    writeSheet: async () => ({ ok: true, value: null }),
    gitStatus: async () => ({ ok: true, value: { root: null, entries: [] } }),
    gitStage: async () => ({ ok: true, value: null }),
    gitUnstage: async () => ({ ok: true, value: null }),
    gitCommit: async () => ({ ok: true, value: null }),
    gitPush: async () => ({ ok: true, value: null }),
    onMenuCommand: () => () => {},
  };
}
