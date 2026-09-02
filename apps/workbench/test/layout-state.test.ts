import { describe, expect, it } from 'vitest';
import { LayoutState, NAVIGATOR_ITEMS, SECONDARY_ITEMS } from '../src/app/shell/layout-state.js';

describe('LayoutState', () => {
  it('starts on the explorer and the inspector, with the sidebar open', () => {
    const layout = new LayoutState();

    expect(layout.navigatorView()).toBe('explorer');
    expect(layout.secondaryView()).toBe('inspector');
    expect(layout.secondaryVisible()).toBe(true);
  });

  it('switches the navigator between its views', () => {
    const layout = new LayoutState();
    layout.showNavigator('sourceControl');

    expect(layout.navigatorView()).toBe('sourceControl');
  });

  it('ignores a view name it does not know', () => {
    const layout = new LayoutState();
    layout.showNavigator('nonsense');

    expect(layout.navigatorView()).toBe('explorer');
  });

  it('collapses the sidebar when its visible view is activated again', () => {
    const layout = new LayoutState();
    layout.showSecondary('inspector');

    expect(layout.secondaryVisible()).toBe(false);
    expect(layout.activeSecondaryId()).toBeNull();
  });

  it('reopens on the chosen view after being collapsed', () => {
    const layout = new LayoutState();
    layout.showSecondary('inspector');
    layout.showSecondary('outline');

    expect(layout.secondaryVisible()).toBe(true);
    expect(layout.secondaryView()).toBe('outline');
    expect(layout.activeSecondaryId()).toBe('outline');
  });

  it('switches between views without collapsing', () => {
    const layout = new LayoutState();
    layout.showSecondary('outline');

    expect(layout.secondaryVisible()).toBe(true);
    expect(layout.secondaryView()).toBe('outline');
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

  it('gives every entry an accessible name, because the icon is decorative', () => {
    for (const item of [...NAVIGATOR_ITEMS, ...SECONDARY_ITEMS]) {
      expect(item.label.length).toBeGreaterThan(2);
      expect(item.icon.startsWith('icon-')).toBe(true);
    }
  });

  it('gives every entry its own icon', () => {
    const icons = [...NAVIGATOR_ITEMS, ...SECONDARY_ITEMS].map((item) => item.icon);
    expect(new Set(icons).size).toBe(icons.length);
  });

  it('offers no entry that merely toggles a region, which would name a position', () => {
    const labels = [...NAVIGATOR_ITEMS, ...SECONDARY_ITEMS].map((item) => item.label.toLowerCase());
    expect(labels.some((label) => label.includes('sidebar') || label.includes('toggle'))).toBe(
      false,
    );
  });
});
