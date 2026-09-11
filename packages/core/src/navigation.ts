/**
 * Where you have been. specification.md §9.4.
 *
 * Two rules, both pure, both here rather than in a component: the history of
 * the sheets that were opened, and the list of the ones that were saved.
 */

/** How many sheets the "recently edited" list keeps. specification.md §9.4. */
export const RECENT_SHEETS_LIMIT = 10;

/**
 * A linear history with a position in it, as a browser has.
 *
 * `at` is the index of the sheet currently shown, or -1 while nothing is
 * open. Everything after it is the forward branch.
 */
export interface NavigationHistory {
  readonly entries: readonly string[];
  readonly at: number;
}

export const EMPTY_HISTORY: NavigationHistory = { entries: [], at: -1 };

/**
 * Records that a sheet was opened.
 *
 * Opening the sheet that is already current changes nothing — selecting the
 * same thing twice is not a journey. Opening anything else **truncates the
 * forward branch**: the path that was abandoned is gone, which is what every
 * browser and every editor has taught.
 */
export function visited(history: NavigationHistory, path: string): NavigationHistory {
  if (history.entries[history.at] === path) {
    return history;
  }
  const kept = history.entries.slice(0, history.at + 1);
  const entries = [...kept, path];
  return { entries, at: entries.length - 1 };
}

/** Whether there is anywhere to go, in each direction. */
export function canGoBack(history: NavigationHistory): boolean {
  return history.at > 0;
}

export function canGoForward(history: NavigationHistory): boolean {
  return history.at >= 0 && history.at < history.entries.length - 1;
}

/**
 * One step, or the same history when there is nowhere to go. The caller opens
 * whatever `entries[at]` names — a step is a move, not an opening.
 */
export function stepped(
  history: NavigationHistory,
  direction: 'back' | 'forward',
): NavigationHistory {
  if (direction === 'back') {
    return canGoBack(history) ? { ...history, at: history.at - 1 } : history;
  }
  return canGoForward(history) ? { ...history, at: history.at + 1 } : history;
}

/** What a step arrives at, or null when the history is empty. */
export function currentPath(history: NavigationHistory): string | null {
  return history.entries[history.at] ?? null;
}

/**
 * Drops a sheet that is gone — deleted, or moved to a new identity.
 *
 * The position follows the entries it survives, so the history reads on
 * without the gap; a history whose every entry is gone is empty again.
 */
export function withoutSheet(history: NavigationHistory, path: string): NavigationHistory {
  const entries = history.entries.filter((entry) => entry !== path);
  if (entries.length === history.entries.length) {
    return history;
  }
  const removedBefore = history.entries
    .slice(0, history.at + 1)
    .filter((entry) => entry === path).length;
  const at = Math.min(history.at - removedBefore, entries.length - 1);
  return { entries, at: Math.max(entries.length === 0 ? -1 : 0, at) };
}

/**
 * Puts a sheet at the front of the "recently edited" list. specification.md §9.4.
 *
 * Same shape as the recent projects of §8.6: an earlier entry for the same
 * sheet moves up rather than being duplicated, and the list is capped.
 */
export function withRecentSheet(
  recent: readonly string[],
  path: string,
  limit: number = RECENT_SHEETS_LIMIT,
): readonly string[] {
  if (path === '') {
    return recent;
  }
  return [path, ...recent.filter((entry) => entry !== path)].slice(0, Math.max(0, limit));
}

/**
 * Reads a stored list, discarding what it cannot read.
 *
 * The list is a convenience and never a source of truth (specification.md §9.4): a
 * malformed file — or one a merge left with conflict markers — is an empty
 * list, never a failure to open the project.
 */
export function readRecentSheets(value: unknown, limit: number = RECENT_SHEETS_LIMIT): readonly string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  const paths: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string' || entry === '' || seen.has(entry)) {
      continue;
    }
    seen.add(entry);
    paths.push(entry);
    if (paths.length >= limit) {
      break;
    }
  }
  return paths;
}
