/**
 * How the workbench's state reaches its components: provided once, at the
 * shell, and injected where it is read. specification.md §8.7.
 *
 * One way rather than two. The drag state used to travel as an input through
 * every level of the tree, while the source control panel took fourteen
 * inputs and eighteen outputs to reach a store that sat one level up. Now a
 * component that needs a store injects it, and the shell's template says
 * only what a region *is*.
 *
 * Everything here is a plain class with a constructor argument, so the
 * factories are the whole of the wiring, and a test builds the same objects
 * with `new`.
 */
import { InjectionToken, inject, signal, type Provider, type WritableSignal } from '@angular/core';
import { EditorSession } from '../editor/editor-session.js';
import { LibraryDrag } from '../shell/library-drag.js';
import { LayoutState } from '../shell/layout-state.js';
import { Localization, systemLanguageTag } from '../localization/localization.js';
import type { Overlay } from '../shell/overlay.js';
import { DESKTOP_BRIDGE, resolveBridge } from './bridge.js';
import { LibraryActions } from './library-actions.js';
import { LibrarySearchStore } from './library-search-store.js';
import { SourceControlActions } from './source-control-actions.js';
import { SourceControlStore } from './source-control-store.js';
import { WorkspaceStore } from './workspace-store.js';

/** What lies over the workbench, if anything. One per shell. */
export const OVERLAY = new InjectionToken<WritableSignal<Overlay | null>>('overlay');

export const WORKBENCH_PROVIDERS: readonly Provider[] = [
  { provide: DESKTOP_BRIDGE, useFactory: resolveBridge },
  { provide: WorkspaceStore, useFactory: () => new WorkspaceStore(inject(DESKTOP_BRIDGE)) },
  { provide: SourceControlStore, useFactory: () => new SourceControlStore(inject(DESKTOP_BRIDGE)) },
  { provide: LibrarySearchStore, useFactory: () => new LibrarySearchStore(inject(DESKTOP_BRIDGE)) },
  { provide: LayoutState, useFactory: () => new LayoutState(inject(DESKTOP_BRIDGE)) },
  {
    provide: Localization,
    useFactory: () => new Localization(inject(LayoutState).interfaceLanguage, systemLanguageTag()),
  },
  { provide: LibraryDrag, useFactory: () => new LibraryDrag() },
  { provide: EditorSession, useFactory: () => new EditorSession() },
  { provide: OVERLAY, useFactory: () => signal<Overlay | null>(null) },
  {
    provide: LibraryActions,
    useFactory: () =>
      new LibraryActions(inject(WorkspaceStore), inject(OVERLAY), inject(Localization)),
  },
  {
    provide: SourceControlActions,
    useFactory: () =>
      new SourceControlActions(
        inject(WorkspaceStore),
        inject(SourceControlStore),
        inject(OVERLAY),
        inject(Localization),
      ),
  },
];
