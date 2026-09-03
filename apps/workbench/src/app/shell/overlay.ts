/**
 * What lies over the workbench: at most one thing at a time. SPEC.md §8.7.
 *
 * The shell used to hold one signal per dialog — a menu, a prompt, a
 * confirmation, the branch list, the resolver, the diff, the ignore editor,
 * the category manager — and nothing stopped two of them from being open at
 * once. One value with a `kind` makes that impossible, and makes every flow
 * read the same way: it puts an overlay up, and confirming or cancelling takes
 * it down.
 *
 * Nothing here is Angular. The flows that open these live in plain classes
 * (`workspace/library-actions.ts`, `workspace/source-control-actions.ts`),
 * which is what makes them testable without a component.
 */
import type { GitBranch, GitIdentity, GitVersions } from '@opera-incerta/desktop-contract';

/** One entry of a context menu: what it says, and what choosing it does. */
export interface MenuEntry {
  readonly label: string;
  readonly run: () => void;
}

/** A question with a text field. Confirming hands the text to `action`. */
export interface Prompt {
  readonly title: string;
  readonly initial: string;
  readonly placeholder: string;
  readonly hint: string | null;
  readonly confirmLabel: string;
  readonly action: (value: string) => void;
}

/** A yes-or-no question before something is done that cannot be undone. */
export interface Confirmation {
  readonly title: string;
  readonly warning: string | null;
  /** What the destructive button says, and what happens afterwards. */
  readonly hint?: string;
  readonly confirmLabel?: string;
  readonly action: () => void;
}

export type Overlay =
  | {
      readonly kind: 'menu';
      readonly entries: readonly MenuEntry[];
      readonly x: number;
      readonly y: number;
    }
  | ({ readonly kind: 'prompt' } & Prompt)
  | ({ readonly kind: 'confirmation' } & Confirmation)
  /** The `.gitignore` being edited. SPEC.md §12. */
  | { readonly kind: 'ignore'; readonly text: string }
  /** The branch list. SPEC.md §12. */
  | { readonly kind: 'branches'; readonly branches: readonly GitBranch[] }
  /** A conflicted file being decided. SPEC.md §12. */
  | { readonly kind: 'resolver'; readonly path: string; readonly text: string }
  /** A diff on screen. SPEC.md §12. */
  | {
      readonly kind: 'diff';
      readonly path: string;
      readonly text: string;
      readonly versions: GitVersions | null;
    }
  /** The category manager. SPEC.md §6.6. */
  | { readonly kind: 'categories' }
  /** The name and e-mail address commits are by. SPEC.md §12. */
  | {
      readonly kind: 'identity';
      readonly initial: GitIdentity | null;
      readonly action: (identity: GitIdentity) => void;
    };

/**
 * Where the flows put their overlay. A writable signal satisfies it; so does
 * anything in a test that records what was asked.
 */
export interface OverlayHost {
  (): Overlay | null;
  set(overlay: Overlay | null): void;
}
