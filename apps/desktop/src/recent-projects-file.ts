/**
 * The recent-projects list on disk. SPEC.md §7.2, §8.6.
 *
 * Installation-local: it lives in the Electron user-data directory and is
 * never synchronized, because which projects *this machine* opened is not part
 * of any project.
 *
 * The list rules — deduplication, ordering, the cap — are the core's pure
 * functions. This only reads and writes the file, and an unreadable file is an
 * empty list rather than a failure to start.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  readRecentProjects,
  withRecentProject,
  withoutRecentProject,
  type RecentProject,
} from '@opera-incerta/core';

export class RecentProjectsFile {
  readonly #path: string;

  constructor(userDataPath: string) {
    this.#path = join(userDataPath, 'recent-projects.json');
  }

  read(): readonly RecentProject[] {
    try {
      return readRecentProjects(JSON.parse(readFileSync(this.#path, 'utf8')) as unknown);
    } catch {
      return [];
    }
  }

  /** Records an opened project at the front of the list. */
  remember(project: RecentProject): readonly RecentProject[] {
    return this.#write(withRecentProject(this.read(), project));
  }

  /** Removes one entry — "remove from list" on a project that is gone. */
  forget(path: string): readonly RecentProject[] {
    return this.#write(withoutRecentProject(this.read(), path));
  }

  #write(list: readonly RecentProject[]): readonly RecentProject[] {
    try {
      mkdirSync(dirname(this.#path), { recursive: true });
      writeFileSync(this.#path, `${JSON.stringify(list, null, 2)}\n`, 'utf8');
    } catch {
      // A list that cannot be stored is a lost convenience, never a reason to
      // interrupt the author.
    }
    return list;
  }
}
