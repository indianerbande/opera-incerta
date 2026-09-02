/**
 * Display names and explicit child order. SPEC.md §6.4.
 *
 * `structure.json` only adds order and display names on top of the filesystem.
 * The filesystem stays the source of truth for existence, so every rule here
 * degrades gracefully: a stale entry is ignored, an unlisted item is appended,
 * a missing entry means alphabetical order and the real directory name.
 */

/** Metadata stored in `.opera-incerta/project.json`. SPEC.md §6.1. */
export interface ProjectRecord {
  /** Assigned once, never changed. Keys installation-local project state. */
  readonly id: string;
  readonly displayName: string;
  /** ISO 8601, written once, never changed. */
  readonly created: string;
}

/** One entry, keyed by normalized relative directory path. Root is `"."`. */
export interface StructureEntry {
  readonly displayName?: string;
  /** Ordered child **file names** — never display names. */
  readonly order?: readonly string[];
}

/** The complete `structure.json` document. */
export type StructureRecord = Readonly<Record<string, StructureEntry>>;

/**
 * Sorting for everything not explicitly ordered.
 *
 * The locale is pinned so that results do not depend on the machine
 * (TESTING.md §1.8), and numeric collation keeps `chapter-2` before
 * `chapter-10`.
 */
const COLLATOR = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

export function compareNames(left: string, right: string): number {
  const collated = COLLATOR.compare(left, right);
  // A stable tiebreak, so two names differing only in case never swap places.
  return collated !== 0 ? collated : (left < right ? -1 : left > right ? 1 : 0);
}

/**
 * Resolves the display order of one group's children.
 *
 * `order` may name items that no longer exist and may omit items that do:
 * the first are ignored, the second are appended alphabetically. Neither is an
 * error, because both happen whenever the author uses a file manager or Git.
 */
export function resolveChildOrder(
  actualNames: readonly string[],
  entry: StructureEntry | undefined,
): readonly string[] {
  const actual = new Set(actualNames);
  const ordered: string[] = [];
  const claimed = new Set<string>();

  for (const name of entry?.order ?? []) {
    if (actual.has(name) && !claimed.has(name)) {
      ordered.push(name);
      claimed.add(name);
    }
  }

  const remaining = actualNames.filter((name) => !claimed.has(name)).sort(compareNames);
  return [...ordered, ...remaining];
}

/**
 * The display name of a group: the recorded one, or the real directory name.
 * An empty recorded name is treated as absent rather than shown as nothing.
 */
export function groupDisplayName(
  directoryName: string,
  entry: StructureEntry | undefined,
): string {
  const recorded = entry?.displayName?.trim();
  return recorded === undefined || recorded === '' ? directoryName : recorded;
}

/**
 * Records a new order for one group, returning a new structure record.
 *
 * Only names that exist are stored, so the file does not accumulate entries
 * for items that were removed elsewhere.
 */
export function withChildOrder(
  structure: StructureRecord,
  relativePath: string,
  order: readonly string[],
): StructureRecord {
  const existing = structure[relativePath] ?? {};
  return { ...structure, [relativePath]: { ...existing, order: [...order] } };
}

/** Records a display name, or removes it when the name is empty. */
export function withDisplayName(
  structure: StructureRecord,
  relativePath: string,
  displayName: string,
): StructureRecord {
  const existing = structure[relativePath] ?? {};
  const trimmed = displayName.trim();

  if (trimmed === '') {
    const { displayName: _removed, ...rest } = existing;
    return { ...structure, [relativePath]: rest };
  }
  return { ...structure, [relativePath]: { ...existing, displayName: trimmed } };
}

/**
 * The order that results from moving one child in front of a sibling.
 *
 * It takes the **resolved** order (§6.4), not the recorded one, because that is
 * what the author sees and drags. `before` names the sibling the item lands in
 * front of; `null` puts it last. Dropping an item onto itself, or where it
 * already is, changes nothing.
 *
 * The whole resolved order is returned, which is what the caller must record: a
 * partial `order` would leave the unlisted children to be appended
 * alphabetically, scrambling the very arrangement being made.
 */
export function reorderChild(
  resolvedOrder: readonly string[],
  name: string,
  before: string | null,
): readonly string[] {
  if (before === name || !resolvedOrder.includes(name)) {
    return resolvedOrder;
  }

  const without = resolvedOrder.filter((candidate) => candidate !== name);
  const index = before === null ? -1 : without.indexOf(before);
  return index === -1
    ? [...without, name]
    : [...without.slice(0, index), name, ...without.slice(index)];
}

/**
 * Moves an item from one group to another, rewriting both orders in one step
 * so the two files can never disagree. The item lands at the end of the target
 * order (SPEC.md §18, phase 3).
 */
export function moveChild(
  structure: StructureRecord,
  from: { readonly path: string; readonly name: string },
  to: { readonly path: string; readonly name: string },
): StructureRecord {
  const sourceOrder = (structure[from.path]?.order ?? []).filter((name) => name !== from.name);
  const targetOrder = (structure[to.path]?.order ?? []).filter((name) => name !== to.name);

  const withSource = withChildOrder(structure, from.path, sourceOrder);
  return withChildOrder(withSource, to.path, [...targetOrder, to.name]);
}

/**
 * Reads a parsed JSON value into a structure record, discarding anything that
 * does not match the shape. A malformed file falls back to default behavior
 * rather than blocking the project (SPEC.md §16).
 */
export function readStructureRecord(value: unknown): StructureRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }

  const record: Record<string, StructureEntry> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      continue;
    }
    const candidate = raw as { displayName?: unknown; order?: unknown };
    const entry: { displayName?: string; order?: readonly string[] } = {};

    if (typeof candidate.displayName === 'string') {
      entry.displayName = candidate.displayName;
    }
    if (Array.isArray(candidate.order)) {
      entry.order = candidate.order.filter((name): name is string => typeof name === 'string');
    }
    record[key] = entry;
  }
  return record;
}
