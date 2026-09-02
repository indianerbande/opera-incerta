import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MENU_COMMANDS } from '@opera-incerta/desktop-contract';
import { MENU_ACCELERATORS } from '../src/application-menu.js';

const source = readFileSync(fileURLToPath(new URL('../src/application-menu.ts', import.meta.url)), 'utf8');

describe('menu commands', () => {
  it('offers every command the contract declares', () => {
    // A command in the contract with no menu item is a command the author has
    // no way to reach.
    expect(Object.keys(MENU_ACCELERATORS).sort()).toEqual([...MENU_COMMANDS].sort());
  });

  it('gives each command a distinct, platform-neutral accelerator', () => {
    const accelerators = Object.values(MENU_ACCELERATORS);

    expect(new Set(accelerators).size).toBe(accelerators.length);
    for (const accelerator of accelerators) {
      expect(accelerator.startsWith('CmdOrCtrl+')).toBe(true);
    }
  });

  it('uses the shortcuts the specification names', () => {
    expect(MENU_ACCELERATORS['project/new']).toBe('CmdOrCtrl+Shift+N');
    expect(MENU_ACCELERATORS['project/open']).toBe('CmdOrCtrl+O');
    expect(MENU_ACCELERATORS['project/close']).toBe('CmdOrCtrl+Shift+W');
    expect(MENU_ACCELERATORS['sheet/save']).toBe('CmdOrCtrl+S');
  });

  it('declares the same accelerator in the menu that it documents', () => {
    for (const accelerator of Object.values(MENU_ACCELERATORS)) {
      expect(source).toContain(`accelerator: '${accelerator}'`);
    }
  });
});

describe('the edit roles', () => {
  it('keeps every editing role, which a custom menu otherwise removes', () => {
    // Setting an application menu replaces Electron's default one. Losing
    // these would break copy and paste inside the editor — the smoke would
    // catch it, but only after the shortcut had already stopped working.
    for (const role of ['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll']) {
      expect(source, role).toContain(`role: '${role}'`);
    }
  });

  it('uses roles rather than hand-wired commands for them', () => {
    // A hand-wired copy command does not work inside a text field; the
    // platform's own role does.
    expect(source).not.toMatch(/label: 'Copy'/);
    expect(source).not.toMatch(/label: 'Paste'/);
  });
});

describe('state-dependent items', () => {
  it('enables saving and closing only with a project open', () => {
    expect(source).toContain("enabled: hasProject");
    const saveSection = source.slice(source.indexOf("label: 'Save'"));
    expect(saveSection.slice(0, 200)).toContain('enabled: hasProject');
  });

  it('routes closing through the window, not through a second reset path', () => {
    expect(source).not.toContain('session.close');
  });
});
