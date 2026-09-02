/**
 * The library as the application shows it. SPEC.md §6.1, §9.
 *
 * Plain data: the Node adapter produces it by reading the filesystem, the
 * renderer displays it, and neither needs the other's dependencies. The
 * selection rules live here too, because "which sheets does this group show"
 * is a rule, not a view concern.
 */
import type { HeadingLevel } from './heading.js';

/**
 * One line of a sheet-list preview, with the level it is shown at.
 * SPEC.md §9.2: the preview carries the actual formatting from the file.
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
   * The first lines of the body, for the sheet list. Blank lines are kept:
   * whether to show them is the reader's choice, not the scanner's
   * (SPEC.md §9.2).
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
 * (SPEC.md §9.2).
 */
export function sheetsInGroup(group: GroupEntry): readonly SheetEntry[] {
  return group.children.filter((child): child is SheetEntry => child.kind === 'sheet');
}

/** The direct subgroups of a group, in display order. */
export function subgroupsOf(group: GroupEntry): readonly GroupEntry[] {
  return group.children.filter((child): child is GroupEntry => child.kind === 'group');
}

/**
 * The library with one sheet shown under a different name.
 *
 * A title that is edited but not yet saved is still the sheet's name as far as
 * the author is concerned, so the tree and the sheet list have to say it. Only
 * the branch down to that sheet is rebuilt; when nothing matches, the very same
 * tree comes back.
 */
export function withSheetDisplayName(
  root: GroupEntry,
  relativePath: string,
  displayName: string,
): GroupEntry {
  let changed = false;
  const children = root.children.map((child) => {
    if (child.kind === 'sheet') {
      if (child.relativePath !== relativePath || child.displayName === displayName) {
        return child;
      }
      changed = true;
      return { ...child, displayName };
    }
    if (child.relativePath !== '.' && !relativePath.startsWith(`${child.relativePath}/`)) {
      return child;
    }
    const rebuilt = withSheetDisplayName(child, relativePath, displayName);
    if (rebuilt !== child) {
      changed = true;
    }
    return rebuilt;
  });
  return changed ? { ...root, children } : root;
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
