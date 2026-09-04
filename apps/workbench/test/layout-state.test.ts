import { describe, expect, it } from 'vitest';
import { COLUMN_BOUNDS, COLUMN_IDEAL_WIDTH, DEFAULT_PREFERENCES } from '@opera-incerta/core';
import type { OperaIncertaBridge } from '@opera-incerta/desktop-contract';
import {
  LayoutState,
  NAVIGATOR_ITEMS,
  SECONDARY_ITEMS,
} from '../src/app/shell/layout-state.js';
import { baseBridge } from './fake-bridge.js';

/** A bridge that records what was stored and can hand back a record. */
function storingBridge(stored: unknown = null): OperaIncertaBridge & { written: unknown[] } {
  const written: unknown[] = [];
  return {
    ...baseBridge(),
    written,
    readPreferences: async () => ({ ok: true, value: stored }),
    writePreferences: async (record) => {
      written.push(record);
      return { ok: true, value: null };
    },
  };
}

describe('regions', () => {
  it('starts on the explorer and the inspector, with the sidebar open', () => {
    const layout = new LayoutState();

    expect(layout.navigatorView()).toBe('explorer');
    expect(layout.secondaryView()).toBe('inspector');
    expect(layout.secondaryVisible()).toBe(true);
  });

  it('switches the navigator', () => {
    const layout = new LayoutState();
    layout.showNavigator('sourceControl');
    expect(layout.navigatorView()).toBe('sourceControl');
  });

  it('collapses when the visible view is activated again, and reopens elsewhere', () => {
    const layout = new LayoutState();
    layout.showSecondary('inspector');
    expect(layout.secondaryVisible()).toBe(false);
    expect(layout.activeSecondaryId()).toBeNull();

    layout.showSecondary('outline');
    expect(layout.secondaryVisible()).toBe(true);
    expect(layout.secondaryView()).toBe('outline');
  });
});

describe('column widths', () => {
  it('starts every column at its ideal width', () => {
    expect(new LayoutState().columnWidths()).toEqual(DEFAULT_PREFERENCES.columnWidths);
  });

  it('widens and narrows by the reported pixels', () => {
    const layout = new LayoutState();
    layout.resizeColumn('navigator', 30);
    expect(layout.columnWidths().navigator).toBe(COLUMN_IDEAL_WIDTH.navigator + 30);

    layout.resizeColumn('navigator', -10);
    expect(layout.columnWidths().navigator).toBe(COLUMN_IDEAL_WIDTH.navigator + 20);
  });

  it('clamps at both bounds rather than following the pointer past them', () => {
    const layout = new LayoutState();
    layout.resizeColumn('navigator', 10_000);
    expect(layout.columnWidths().navigator).toBe(COLUMN_BOUNDS.navigator.max);

    layout.resizeColumn('navigator', -10_000);
    expect(layout.columnWidths().navigator).toBe(COLUMN_BOUNDS.navigator.min);
  });

  it('moves only the column being dragged', () => {
    const layout = new LayoutState();
    layout.resizeColumn('sheetList', 40);

    expect(layout.columnWidths().navigator).toBe(COLUMN_IDEAL_WIDTH.navigator);
    expect(layout.columnWidths().secondarySidebar).toBe(COLUMN_IDEAL_WIDTH.secondarySidebar);
  });

  it('restores the ideal width on reset', () => {
    const layout = new LayoutState();
    layout.resizeColumn('sheetList', 50);
    layout.resetColumn('sheetList');

    expect(layout.columnWidths().sheetList).toBe(COLUMN_IDEAL_WIDTH.sheetList);
  });

  it('does not store a drag that changed nothing', async () => {
    const bridge = storingBridge();
    const layout = new LayoutState(bridge);
    layout.resizeColumn('navigator', -10_000);
    const afterClamp = bridge.written.length;

    layout.resizeColumn('navigator', -50);
    expect(bridge.written).toHaveLength(afterClamp);
  });

  it('never lets a view switch move a column', () => {
    // The regression this guards (CONVENTIONS.md C-U1).
    const layout = new LayoutState();
    layout.resizeColumn('navigator', 25);
    const width = layout.columnWidths().navigator;

    layout.showNavigator('sourceControl');
    layout.showSecondary('outline');
    layout.showSecondary('outline');

    expect(layout.columnWidths().navigator).toBe(width);
  });
});

describe('persistence', () => {
  it('stores the front matter switches like every other preference', async () => {
    const bridge = storingBridge();
    const layout = new LayoutState(bridge);
    layout.toggleFrontMatter();
    layout.toggleFrontMatterWritable();
    layout.toggleOwnedFrontMatter();
    await Promise.resolve();

    // Three changes, three records, the last one carrying all three.
    expect(bridge.written).toHaveLength(3);
    expect(bridge.written[2]).toMatchObject({
      showFrontMatter: !DEFAULT_PREFERENCES.showFrontMatter,
      frontMatterWritable: !DEFAULT_PREFERENCES.frontMatterWritable,
      showOwnedFrontMatter: !DEFAULT_PREFERENCES.showOwnedFrontMatter,
    });
  });

  it('stores the whole record on every change', async () => {
    const bridge = storingBridge();
    const layout = new LayoutState(bridge);
    layout.resizeColumn('navigator', 20);

    expect(bridge.written).toHaveLength(1);
    expect(bridge.written[0]).toMatchObject({
      columnWidths: { navigator: COLUMN_IDEAL_WIDTH.navigator + 20 },
      navigatorView: 'explorer',
    });
  });

  it('applies a stored record on load', async () => {
    const layout = new LayoutState(
      storingBridge({
        columnWidths: { navigator: 200, sheetList: 300, secondarySidebar: 210 },
        secondaryView: 'outline',
        secondaryVisible: false,
        sheetListDensity: 'large',
      }),
    );
    await layout.load();

    expect(layout.columnWidths().navigator).toBe(200);
    expect(layout.secondaryView()).toBe('outline');
    expect(layout.secondaryVisible()).toBe(false);
    expect(layout.sheetListDensity()).toBe('large');
  });

  it('clamps a stored width that no longer fits its bounds', async () => {
    const layout = new LayoutState(storingBridge({ columnWidths: { navigator: 9999 } }));
    await layout.load();

    expect(layout.columnWidths().navigator).toBe(COLUMN_BOUNDS.navigator.max);
  });

  it('keeps its defaults when nothing is stored', async () => {
    const layout = new LayoutState(storingBridge(null));
    await layout.load();

    expect(layout.columnWidths()).toEqual(DEFAULT_PREFERENCES.columnWidths);
  });

  it('survives a bridge that cannot store, without interrupting', () => {
    const layout = new LayoutState({
      ...baseBridge(),
      writePreferences: async () => {
        throw new Error('disk full');
      },
    });

    expect(() => layout.resizeColumn('navigator', 10)).not.toThrow();
    expect(layout.columnWidths().navigator).toBe(COLUMN_IDEAL_WIDTH.navigator + 10);
  });

  it('works without a bridge at all', async () => {
    const layout = new LayoutState(null);
    await layout.load();
    layout.resizeColumn('navigator', 10);

    expect(layout.columnWidths().navigator).toBe(COLUMN_IDEAL_WIDTH.navigator + 10);
  });
});

describe('the activity bar inventories', () => {
  it('cover every view of their region', () => {
    expect(NAVIGATOR_ITEMS.map((item) => item.id)).toEqual(['explorer', 'sourceControl']);
    expect(SECONDARY_ITEMS.map((item) => item.id)).toEqual([
      'inspector',
      'outline',
      'ai',
      'snapshots',
    ]);
  });

  it('gives every entry an accessible name and its own icon', () => {
    const icons = [...NAVIGATOR_ITEMS, ...SECONDARY_ITEMS].map((item) => item.icon);
    expect(new Set(icons).size).toBe(icons.length);

    for (const item of [...NAVIGATOR_ITEMS, ...SECONDARY_ITEMS]) {
      expect(item.label.length).toBeGreaterThan(2);
      expect(item.icon.startsWith('icon-')).toBe(true);
    }
  });

  it('offers no entry that merely toggles a region, which would name a position', () => {
    const labels = [...NAVIGATOR_ITEMS, ...SECONDARY_ITEMS].map((item) => item.label.toLowerCase());
    expect(labels.some((label) => label.includes('sidebar') || label.includes('toggle'))).toBe(
      false,
    );
  });
});

describe('the settings dialog’s way in (SPEC.md §13)', () => {
  it('sets a switch by key and stores it', () => {
    const bridge = storingBridge();
    const layout = new LayoutState(bridge);
    expect(layout.switchValue('showBlankLines')).toBe(false);
    layout.setSwitch('showBlankLines', true);
    expect(layout.showBlankLines()).toBe(true);
    expect(layout.switchValue('showBlankLines')).toBe(true);
    expect((bridge.written.at(-1) as { showBlankLines: boolean }).showBlankLines).toBe(true);
  });

  it('resets the complete record to its defaults, layout included', () => {
    const bridge = storingBridge();
    const layout = new LayoutState(bridge);
    layout.setSwitch('showDeeperOutline', true);
    layout.setDensity('large');
    layout.showNavigator('sourceControl');
    layout.resizeColumn('navigator', 40);

    layout.resetPreferences();

    expect(layout.snapshot()).toEqual(DEFAULT_PREFERENCES);
    expect(bridge.written.at(-1)).toEqual(DEFAULT_PREFERENCES);
  });
});
