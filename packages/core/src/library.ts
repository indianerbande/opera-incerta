/**
 * The library as the application shows it. specification.md §6.1, §9.
 *
 * Plain data: the Node adapter produces it by reading the filesystem, the
 * renderer displays it, and neither needs the other's dependencies. The
 * selection rules live here too, because "which sheets does this group show"
 * is a rule, not a view concern.
 */
import type { HeadingLevel } from './heading.js';

/**
 * One line of a sheet-list preview, with the level it is shown at.
 * specification.md §9.2: the preview carries the actual formatting from the file.
 */
export interface PreviewLine {
  readonly text: string;
  readonly level: HeadingLevel | null;
}

export interface SheetEntry {
  readonly kind: 'sheet';
  /** File name, the stable technical identifier. Never renamed by the app. */
  readonly name: string;
  /** Path relative to the project root, with forward slashes. */
  readonly relativePath: string;
  /** Front matter title, or the file name without its extension. */
  readonly displayName: string;
  /**
   * The page category's id, as the file carries it. Resolving it is the
   * reader's job: an id naming nothing is uncategorized, not an error
   * (specification.md §6.6).
   */
  readonly category?: string;
  /**
   * The first lines of the body, for the sheet list. Blank lines are kept:
   * whether to show them is the reader's choice, not the scanner's
   * (specification.md §9.2).
   */
  readonly preview: readonly PreviewLine[];
}

export interface GroupEntry {
  readonly kind: 'group';
  readonly name: string;
  readonly relativePath: string;
  /** Recorded display name, or the real directory name. */
  readonly displayName: string;
  readonly children: readonly LibraryEntry[];
}

export type LibraryEntry = SheetEntry | GroupEntry;

/** Depth-first walk over every entry. */
export function* walkLibrary(entry: LibraryEntry): Generator<LibraryEntry> {
  yield entry;
  if (entry.kind === 'group') {
    for (const child of entry.children) {
      yield* walkLibrary(child);
    }
  }
}

/** Every sheet below an entry, in display order. */
export function sheetsOf(entry: LibraryEntry): readonly SheetEntry[] {
  return [...walkLibrary(entry)].filter((item): item is SheetEntry => item.kind === 'sheet');
}

/** Every group below an entry, the entry itself included when it is one. */
export function groupsOf(entry: LibraryEntry): readonly GroupEntry[] {
  return [...walkLibrary(entry)].filter((item): item is GroupEntry => item.kind === 'group');
}

/** Finds a group by its relative path. */
export function findGroup(root: GroupEntry, relativePath: string): GroupEntry | null {
  return groupsOf(root).find((group) => group.relativePath === relativePath) ?? null;
}

/** Finds a sheet by its relative path. */
export function findSheet(root: GroupEntry, relativePath: string): SheetEntry | null {
  return sheetsOf(root).find((sheet) => sheet.relativePath === relativePath) ?? null;
}

/**
 * The sheets the sheet list shows for a group: its **direct** sheets only.
 *
 * Sheets of nested groups belong to those groups. Flattening them here would
 * make the middle column a search result rather than a place in the library
 * (specification.md §9.2).
 */
export function sheetsInGroup(group: GroupEntry): readonly SheetEntry[] {
  return group.children.filter((child): child is SheetEntry => child.kind === 'sheet');
}

/** The direct subgroups of a group, in display order. */
export function subgroupsOf(group: GroupEntry): readonly GroupEntry[] {
  return group.children.filter((child): child is GroupEntry => child.kind === 'group');
}

/** What may be shown differently from what the file says. */
export interface ShownSheet {
  readonly displayName?: string;
  /** `null` removes the category; leaving it out keeps the file's. */
  readonly category?: string | null;
}

/**
 * The library with one sheet shown as the author is currently editing it.
 *
 * A title or a category that has been changed but not saved is still what the
 * author means, so the tree and the sheet list have to say it — an edit that
 * nothing visibly answers looks like an edit that failed. Only the branch down
 * to that sheet is rebuilt; when nothing matches, the very same tree comes
 * back.
 */
export function withShownSheet(
  root: GroupEntry,
  relativePath: string,
  shown: ShownSheet,
): GroupEntry {
  let changed = false;
  const children = root.children.map((child) => {
    if (child.kind === 'sheet') {
      if (child.relativePath !== relativePath) {
        return child;
      }
      const next = applyShown(child, shown);
      if (next !== child) {
        changed = true;
      }
      return next;
    }
    if (child.relativePath !== '.' && !relativePath.startsWith(`${child.relativePath}/`)) {
      return child;
    }
    const rebuilt = withShownSheet(child, relativePath, shown);
    if (rebuilt !== child) {
      changed = true;
    }
    return rebuilt;
  });
  return changed ? { ...root, children } : root;
}

function applyShown(sheet: SheetEntry, shown: ShownSheet): SheetEntry {
  const displayName = shown.displayName ?? sheet.displayName;
  const category = shown.category === undefined ? sheet.category : (shown.category ?? undefined);
  if (displayName === sheet.displayName && category === sheet.category) {
    return sheet;
  }

  const { category: _dropped, ...rest } = sheet;
  return category === undefined ? { ...rest, displayName } : { ...rest, displayName, category };
}

/**
 * The path of every ancestor group of a relative path, root first.
 * Used to expand the tree down to a revealed sheet.
 */
export function ancestorPaths(relativePath: string): readonly string[] {
  if (relativePath === '.' || relativePath === '') {
    return [];
  }
  const segments = relativePath.split('/').slice(0, -1);
  const paths: string[] = ['.'];
  let current = '';
  for (const segment of segments) {
    current = current === '' ? segment : `${current}/${segment}`;
    paths.push(current);
  }
  return paths;
}
