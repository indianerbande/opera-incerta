/**
 * The recent-projects list of the welcome window. specification.md §8.6.
 *
 * Pure list logic, kept out of the view so that deduplication, ordering, and
 * the cap are testable without a window.
 */

/** How many entries the welcome window shows. specification.md §8.6. */
export const RECENT_PROJECTS_LIMIT = 10;

export interface RecentProject {
  /** Absolute path. The identity of an entry: two entries never share one. */
  readonly path: string;
  readonly displayName: string;
}

/**
 * Puts a project at the front of the list, removing any earlier entry for the
 * same path and capping the result. Re-opening a project moves it up rather
 * than duplicating it, and its display name is refreshed.
 */
export function withRecentProject(
  recent: readonly RecentProject[],
  project: RecentProject,
  limit: number = RECENT_PROJECTS_LIMIT,
): readonly RecentProject[] {
  const rest = recent.filter((entry) => entry.path !== project.path);
  return [project, ...rest].slice(0, Math.max(0, limit));
}

/** Removes one entry, used by "remove from list" on a project that is gone. */
export function withoutRecentProject(
  recent: readonly RecentProject[],
  path: string,
): readonly RecentProject[] {
  return recent.filter((entry) => entry.path !== path);
}

/**
 * Reads a parsed JSON value into a recent list, discarding malformed entries.
 * An unreadable list is an empty list, never a failure to start.
 */
export function readRecentProjects(value: unknown): readonly RecentProject[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const projects: RecentProject[] = [];
  const seen = new Set<string>();

  for (const raw of value) {
    if (typeof raw !== 'object' || raw === null) {
      continue;
    }
    const candidate = raw as { path?: unknown; displayName?: unknown };
    if (typeof candidate.path !== 'string' || candidate.path === '') {
      continue;
    }
    if (seen.has(candidate.path)) {
      continue;
    }
    seen.add(candidate.path);
    projects.push({
      path: candidate.path,
      displayName:
        typeof candidate.displayName === 'string' ? candidate.displayName : candidate.path,
    });
  }

  return projects.slice(0, RECENT_PROJECTS_LIMIT);
}
