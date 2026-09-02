import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { COLUMN_IDEAL_WIDTH, type EditorDocument } from '@opera-incerta/core';
import { BRIDGE_GLOBAL, CONTRACT_VERSION } from '@opera-incerta/desktop-contract';
import { EditorComponent } from './editor/editor.component.js';
import { ACTIVITY_BAR_WIDTH } from './workbench-layout.js';

/**
 * Shown until the library is wired up. It exercises the display model the
 * editor is built around: heading levels, the marker gutter, and inline
 * delimiters that hide outside the cursor's line.
 */
const PLACEHOLDER_DOCUMENT: EditorDocument = {
  id: 'placeholder',
  text: [
    '# Opera Incerta',
    '',
    'A local desktop tool for collecting and writing texts, and for growing a',
    'structured book manuscript out of them.',
    '',
    '## What this pane shows',
    '',
    'Headings appear at their own size, and their level is labelled in the',
    'gutter beside the text. Inline **markers are hidden** until the cursor',
    'enters their line, where they become editable again.',
    '',
    '### On disk',
    '',
    'The file stays plain Markdown. Nothing above is stored differently from',
    'what any other editor would write.',
    '',
    '```markdown',
    '# A fenced block is shown exactly as written.',
    '```',
    '',
  ].join('\n'),
};

/**
 * Scaffold of the workbench shell: the region skeleton of SPEC.md §8.2 with the
 * specified widths, and nothing else. Views, dividers, and panel headers follow
 * in their own rounds (TODO.md).
 */
@Component({
  selector: 'wi-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EditorComponent],
  template: `
    <div class="workbench">
      <aside class="activity-bar" [style.width.px]="activityBarWidth"></aside>
      <section class="navigator" [style.width.px]="navigatorWidth()">Navigator</section>
      <section class="sheet-list" [style.width.px]="sheetListWidth()">Sheet list</section>
      <section class="editor">
        <header class="editor-header">
          <h1>Opera Incerta</h1>
          <p>{{ hostDescription }}</p>
        </header>
        <wi-editor [document]="placeholderDocument" (textChange)="onTextChange($event)" />
      </section>
      <section class="secondary-sidebar" [style.width.px]="secondarySidebarWidth()">
        Secondary sidebar
      </section>
      <aside class="activity-bar" [style.width.px]="activityBarWidth"></aside>
    </div>
  `,
  styles: `
    .workbench {
      display: flex;
      height: 100vh;
      font: 13px/1.4 system-ui, sans-serif;
    }
    .workbench > * {
      overflow: hidden;
      padding: 8px;
      border-inline-end: 1px solid rgba(128, 128, 128, 0.35);
    }
    .workbench > :last-child {
      border-inline-end: none;
    }
    .activity-bar {
      flex: none;
      padding: 8px 0;
    }
    .navigator,
    .sheet-list,
    .secondary-sidebar {
      flex: none;
    }
    .editor {
      flex: 1 1 auto;
      min-width: 380px;
      display: flex;
      flex-direction: column;
      padding: 0;
    }
    .editor-header {
      flex: none;
      padding: 8px;
      border-block-end: 1px solid rgba(128, 128, 128, 0.35);
    }
    .editor-header h1 {
      margin: 0;
      font-size: 15px;
    }
    .editor-header p {
      margin: 2px 0 0;
      color: rgba(128, 128, 128, 0.9);
    }
    wi-editor {
      flex: 1 1 auto;
      min-height: 0;
    }
  `,
})
export class AppComponent {
  protected readonly activityBarWidth = ACTIVITY_BAR_WIDTH;
  protected readonly navigatorWidth = signal(COLUMN_IDEAL_WIDTH.navigator);
  protected readonly sheetListWidth = signal(COLUMN_IDEAL_WIDTH.sheetList);
  protected readonly secondarySidebarWidth = signal(COLUMN_IDEAL_WIDTH.secondarySidebar);

  /**
   * The renderer must work in the desktop shell and in the isolated
   * development harness, so the bridge is detected rather than assumed.
   */
  protected readonly placeholderDocument = PLACEHOLDER_DOCUMENT;

  /** Wired to nothing yet: saving belongs to the document round. */
  protected onTextChange(text: string): void {
    this.lastLength.set(text.length);
  }

  private readonly lastLength = signal(PLACEHOLDER_DOCUMENT.text.length);

  protected readonly hostDescription =
    BRIDGE_GLOBAL in globalThis
      ? `Desktop shell, bridge contract v${CONTRACT_VERSION}.`
      : 'Development harness — no desktop bridge present.';
}
