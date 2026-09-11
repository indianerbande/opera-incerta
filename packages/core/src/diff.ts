/**
 * Reading Git's own diff output. specification.md §12.
 *
 * The text is shown exactly as Git wrote it — it is tool output and is never
 * localized (§14.2) — so the only rule here is which kind each line is, which
 * decides how it is coloured. Colour is presentation; the words are Git's.
 */

export type DiffLineKind = 'added' | 'removed' | 'hunk' | 'meta' | 'context';

/**
 * What a line of unified diff is.
 *
 * The order of the checks matters: `+++` and `---` are file headers, not an
 * added and a removed line, and they appear before any hunk.
 */
export function diffLineKind(line: string, insideHunk: boolean): DiffLineKind {
  if (line.startsWith('@@')) {
    return 'hunk';
  }
  if (!insideHunk) {
    return 'meta';
  }
  if (line.startsWith('+')) {
    return 'added';
  }
  if (line.startsWith('-')) {
    return 'removed';
  }
  // `\ No newline at end of file` belongs to the hunk but is neither side.
  return line.startsWith('\\') ? 'meta' : 'context';
}

export interface DiffLine {
  readonly text: string;
  readonly kind: DiffLineKind;
}

/**
 * Splits diff output into classified lines.
 *
 * Everything before the first `@@` is a header, whatever it starts with. That
 * is what keeps `--- a/scene.md` from being read as a removed line.
 */
export function readDiff(text: string): readonly DiffLine[] {
  const lines = text.split('\n');
  // A line of a hunk always carries its marker — a space for context — so a
  // truly empty line is never part of one, and trailing ones are just the
  // final newline.
  while (lines[lines.length - 1] === '') {
    lines.pop();
  }

  let insideHunk = false;
  return lines.map((line) => {
    const kind = diffLineKind(line, insideHunk);
    if (kind === 'hunk') {
      insideHunk = true;
    }
    return { text: line, kind };
  });
}
