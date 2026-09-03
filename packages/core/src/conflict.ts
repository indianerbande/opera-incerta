/**
 * Reading and resolving the conflict markers Git leaves in a merged file.
 * SPEC.md §12.
 *
 * A merge writes markers **into the manuscript**:
 *
 * ```
 * <<<<<<< HEAD
 * the version here
 * =======
 * the version from the remote
 * >>>>>>> origin/main
 * ```
 *
 * They must never reach the editor: an author who types around them saves a
 * file that is neither version. So the file is read here into the parts that
 * are settled and the parts that are not, each side kept separately, and
 * written back with a choice made for every conflict and no marker left.
 *
 * **Resolution is per region, never per file.** Git has already merged
 * everything that did not overlap; taking one side of the whole file would
 * throw that away and be worse than what Git produced.
 */

/** A stretch of the file that both sides agree on. */
export interface SettledText {
  readonly kind: 'settled';
  readonly text: string;
}

/** A stretch they disagree about, with both versions kept. */
export interface ConflictRegion {
  readonly kind: 'conflict';
  /** The version in this working copy. */
  readonly ours: string;
  /** The version that came in. */
  readonly theirs: string;
  /** The common ancestor, when the file was written in `diff3` style. */
  readonly base: string | null;
  /** What Git labelled the two sides, for showing the author where they came from. */
  readonly oursLabel: string;
  readonly theirsLabel: string;
}

export type ConflictPart = SettledText | ConflictRegion;

/** Which version of a region to keep. */
export type ConflictChoice = 'ours' | 'theirs';

const START = /^<{7}(?: (.*))?$/u;
const BASE = /^\|{7}(?: (.*))?$/u;
const SEPARATOR = /^={7}$/u;
const END = /^>{7}(?: (.*))?$/u;

/**
 * Whether a text carries at least one conflict the resolver can decide.
 *
 * Defined through the parser rather than by looking for `<<<<<<<` alone: a
 * start marker that never closes is ordinary text to the parser, and a store
 * that locked the sheet for it would lock a sheet the resolver has nothing
 * to resolve in. The two must agree, so one of them is defined by the other.
 */
export function hasConflictMarkers(text: string): boolean {
  return countConflicts(parseConflicts(text)) > 0;
}

/**
 * Splits a merged file into settled text and conflict regions.
 *
 * A file without markers is one settled part, which is what makes this safe to
 * run over anything. Markers that never close are treated as ordinary text:
 * inventing a region out of a broken file would be a guess, and the file is
 * the author's.
 */
export function parseConflicts(text: string): readonly ConflictPart[] {
  const lines = text.split('\n');
  const parts: ConflictPart[] = [];
  let settled: string[] = [];

  const flush = (): void => {
    if (settled.length > 0) {
      parts.push({ kind: 'settled', text: settled.join('\n') });
      settled = [];
    }
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] as string;
    const start = START.exec(line);
    if (start === null) {
      settled.push(line);
      continue;
    }

    const region = readRegion(lines, index, start[1] ?? '');
    if (region === null) {
      // A marker that never closes: not a conflict, just a line.
      settled.push(line);
      continue;
    }
    flush();
    parts.push(region.region);
    index = region.endIndex;
  }

  flush();
  return parts;
}

function readRegion(
  lines: readonly string[],
  startIndex: number,
  oursLabel: string,
): { region: ConflictRegion; endIndex: number } | null {
  const ours: string[] = [];
  const base: string[] = [];
  const theirs: string[] = [];
  let section: 'ours' | 'base' | 'theirs' = 'ours';
  let sawBase = false;

  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index] as string;

    if (BASE.test(line) && section === 'ours') {
      section = 'base';
      sawBase = true;
      continue;
    }
    if (SEPARATOR.test(line) && section !== 'theirs') {
      section = 'theirs';
      continue;
    }

    const end = END.exec(line);
    if (end !== null && section === 'theirs') {
      return {
        region: {
          kind: 'conflict',
          ours: ours.join('\n'),
          theirs: theirs.join('\n'),
          base: sawBase ? base.join('\n') : null,
          oursLabel,
          theirsLabel: end[1] ?? '',
        },
        endIndex: index,
      };
    }

    if (section === 'ours') {
      ours.push(line);
    } else if (section === 'base') {
      base.push(line);
    } else {
      theirs.push(line);
    }
  }
  return null;
}

/**
 * Writes the file back with one side chosen for every conflict, and no marker
 * left behind.
 *
 * A region without a choice keeps `ours`, which is the working copy's own
 * text: a resolution that silently preferred the incoming version would be a
 * decision the author did not make.
 */
export function resolveConflicts(
  parts: readonly ConflictPart[],
  choices: readonly ConflictChoice[],
): string {
  let conflictIndex = 0;
  return parts
    .map((part) => {
      if (part.kind === 'settled') {
        return part.text;
      }
      const choice = choices[conflictIndex] ?? 'ours';
      conflictIndex += 1;
      return choice === 'theirs' ? part.theirs : part.ours;
    })
    .join('\n');
}

/** How many regions still need a decision. */
export function countConflicts(parts: readonly ConflictPart[]): number {
  return parts.filter((part) => part.kind === 'conflict').length;
}
