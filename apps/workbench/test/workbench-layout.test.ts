import { describe, expect, it } from 'vitest';
import { COLUMN_BOUNDS, COLUMN_IDEAL_WIDTH } from '@opera-incerta/core';
import {
  ACTIVITY_BAR_WIDTH,
  PANEL_HEADER_HEIGHT,
  WINDOW_GEOMETRY,
  WORKBENCH_REGIONS,
} from '../src/app/workbench-layout.js';

describe('workbench regions', () => {
  it('names every region of the specified shell exactly once', () => {
    const ids = WORKBENCH_REGIONS.map((region) => region.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([
      'activityBarLeading',
      'navigator',
      'sheetList',
      'editor',
      'secondarySidebar',
      'activityBarTrailing',
      'bottomPanel',
    ]);
  });

  it('keeps the editor unresizable, because it fills the remaining width', () => {
    const editor = WORKBENCH_REGIONS.find((region) => region.id === 'editor');
    expect(editor?.resizable).toBe(false);
  });

  it('lets only the navigator and the secondary sidebar switch views', () => {
    const withViews = WORKBENCH_REGIONS.filter((region) => region.views.length > 1).map(
      (region) => region.id,
    );
    expect(withViews).toEqual(['navigator', 'secondarySidebar']);
  });
});

describe('shell constants', () => {
  it('fits both activity bars and every column inside the minimum window width', () => {
    const columns =
      COLUMN_BOUNDS.navigator.min + COLUMN_BOUNDS.sheetList.min + COLUMN_BOUNDS.secondarySidebar.min;
    const editorMinimum = 380;
    const required = 2 * ACTIVITY_BAR_WIDTH + columns + editorMinimum;

    expect(required).toBeLessThanOrEqual(WINDOW_GEOMETRY.minimumWidth);
  });

  it('opens larger than its minimum', () => {
    expect(WINDOW_GEOMETRY.defaultWidth).toBeGreaterThan(WINDOW_GEOMETRY.minimumWidth);
    expect(WINDOW_GEOMETRY.defaultHeight).toBeGreaterThan(WINDOW_GEOMETRY.minimumHeight);
  });

  it('starts every column at its ideal width', () => {
    expect(COLUMN_IDEAL_WIDTH.navigator).toBe(160);
    expect(PANEL_HEADER_HEIGHT).toBe(36);
  });
});
