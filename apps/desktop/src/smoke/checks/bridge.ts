/**
 * The bridge itself: it answers with the contract version, and it refuses a
 * path out of the project on every channel that carries one. SPEC.md §5.3.
 *
 * Part of the smoke; see `smoke/README.md` for how a check is written.
 */
import { type BrowserWindow } from 'electron';
import { BRIDGE_GLOBAL, CONTRACT_VERSION } from '@opera-incerta/desktop-contract';

/**
 * The bridge refuses a path that leaves the project, on every channel that
 * carries one. SPEC.md §5.3.
 *
 * Asked through the real bridge from the real renderer, because the guards
 * are unit-tested in the contract and the containment in the session — and
 * neither of those proves that the handler in *this* process calls them. The
 * one that did not was `gitDiff`, whose `--no-index` fallback would return
 * any file the author can read. The expected answer is the contract's
 * refusal, not a git error: the request must never reach git.
 */
export async function checkBridgeRefusesTraversal(window: BrowserWindow): Promise<void> {
  const answers = (await window.webContents.executeJavaScript(
    `(async () => {
       const bridge = window.${BRIDGE_GLOBAL};
       const escape = '../../../../../../../etc/hosts';
       const attempts = {
         diffUp: bridge.gitDiff({ path: escape }),
         diffAbsolute: bridge.gitDiff({ path: '/etc/hosts' }),
         diffEncoded: bridge.gitDiff({ path: '%2e%2e/%2e%2e/etc/hosts' }),
         versions: bridge.gitVersions({ path: escape }),
         resolve: bridge.gitResolve({ path: escape, text: '' }),
         discard: bridge.gitDiscard({ paths: ['opening.md', escape] }),
         watch: bridge.watchTargets({ group: escape, sheet: null }),
         del: bridge.deleteEntry({ path: escape }),
         create: bridge.createSheet({ path: escape, name: 'Nope' }),
         place: bridge.placeEntry({ path: 'opening.md', into: escape, before: null }),
       };
       const out = {};
       for (const [name, promise] of Object.entries(attempts)) {
         out[name] = await promise;
       }
       return out;
     })()`,
  )) as Record<string, { ok: boolean; code?: string; value?: unknown }>;

  for (const [name, answer] of Object.entries(answers)) {
    if (answer.ok) {
      throw new Error(`the bridge answered a traversal on ${name}: ${JSON.stringify(answer)}`);
    }
    if (answer.code !== 'bridge/invalid-request') {
      throw new Error(`a traversal on ${name} reached a handler: ${JSON.stringify(answer)}`);
    }
  }

  console.log(
    `smoke ok: the bridge refused a path out of the project on ${String(
      Object.keys(answers).length,
    )} channels, before any handler saw it`,
  );
}

/**
 * The workbench rendered its regions: two activity bars and four columns
 * (SPEC.md §8.2), a divider per resizable column, a header per panel.
 */
export async function checkWorkbenchRendered(window: BrowserWindow): Promise<void> {
  const shell = (await window.webContents.executeJavaScript(
    `(() => {
       const workbench = document.querySelector('wi-root .workbench');
       if (workbench === null) { return null; }
       return {
         regions:
           workbench.querySelectorAll(':scope > section').length +
           workbench.querySelectorAll(':scope > wi-activity-bar').length,
         dividers: workbench.querySelectorAll(':scope > wi-resize-divider').length,
         headers: document.querySelectorAll('wi-panel-header').length,
       };
     })()`,
  )) as { regions: number; dividers: number; headers: number } | null;

  if (shell === null) {
    throw new Error('the workbench did not render');
  }
  if (shell.regions !== 6) {
    throw new Error(`expected six regions, found ${shell.regions}`);
  }
  if (shell.dividers !== 3) {
    throw new Error(`expected three dividers, found ${shell.dividers}`);
  }
  if (shell.headers < 4) {
    throw new Error(`every panel needs a header, found ${shell.headers}`);
  }
}

/** The versioned bridge answers through IPC, with the version both sides expect. */
export async function checkBridgeAnswers(window: BrowserWindow): Promise<void> {
  const bridgeVersion: unknown = await window.webContents.executeJavaScript(
    `typeof window.${BRIDGE_GLOBAL} === 'object'` +
      ` ? window.${BRIDGE_GLOBAL}.contractVersion()` +
      ' : null',
  );
  if (bridgeVersion !== CONTRACT_VERSION) {
    throw new Error(`bridge answered ${JSON.stringify(bridgeVersion)}`);
  }
  console.log(`smoke ok: renderer rendered, bridge contract v${CONTRACT_VERSION}`);
}

/**
 * The editor laid out: a heading line taller than body text, a gutter marker
 * beside it, no visible `#` prefix, and the `#` inside a fenced block left
 * alone. The editor is the part most likely to render as an empty box, so
 * this asks for evidence rather than presence. Needs a sheet selected.
 */
export async function checkEditorLaidOut(window: BrowserWindow): Promise<void> {
  const editor = (await window.webContents.executeJavaScript(
    `(() => {
       const lines = [...document.querySelectorAll('.cm-line')];
       const heading = lines.find((line) => line.classList.contains('cm-heading-1'));
       const body = lines.find((line) => !line.className.includes('cm-heading'));
       if (heading === undefined || body === undefined) { return null; }
       return {
         lines: lines.length,
         headingHeight: heading.getBoundingClientRect().height,
         bodyHeight: body.getBoundingClientRect().height,
         markers: [...document.querySelectorAll('.cm-heading-marker')]
           .filter((marker) => marker.dataset.line !== '0').length,
         hidesPrefix: !heading.textContent.includes('#'),
         fencedLineVisible: [...document.querySelectorAll('.cm-line')]
           .some((line) => line.textContent.startsWith('# A fenced block')),
       };
     })()`,
  )) as {
    lines: number;
    headingHeight: number;
    bodyHeight: number;
    markers: number;
    hidesPrefix: boolean;
    fencedLineVisible: boolean;
  } | null;

  if (editor === null) {
    throw new Error('the editor did not render its lines');
  }
  if (!(editor.headingHeight > editor.bodyHeight)) {
    throw new Error(
      `heading not taller than body: ${editor.headingHeight} vs ${editor.bodyHeight}`,
    );
  }
  if (editor.markers === 0) {
    throw new Error('no heading markers in the gutter');
  }
  if (!editor.hidesPrefix) {
    throw new Error('the heading line still shows its Markdown prefix');
  }
  // Three headings in the placeholder document. A fourth would mean the `#`
  // inside the fenced block was labelled as one — the defect the visual
  // check found.
  if (editor.markers !== 3) {
    throw new Error(`expected 3 gutter markers, found ${editor.markers}`);
  }
  if (!editor.fencedLineVisible) {
    throw new Error('the fenced line is not shown verbatim');
  }
  console.log(
    `smoke ok: editor laid out ${editor.lines} lines, heading ${editor.headingHeight}px ` +
      `over body ${editor.bodyHeight}px, ${editor.markers} gutter markers`,
  );
}
