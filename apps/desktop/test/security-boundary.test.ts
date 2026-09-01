import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CHANNELS } from '@opera-incerta/desktop-contract';

function readSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');
}

const mainSource = readSource('../src/main.ts');
const preloadSource = readSource('../src/preload.ts');

describe('renderer window options', () => {
  it('isolates and sandboxes the renderer and disables Node.js integration', () => {
    expect(mainSource).toContain('contextIsolation: true');
    expect(mainSource).toContain('sandbox: true');
    expect(mainSource).toContain('nodeIntegration: false');
    expect(mainSource).toContain('webviewTag: false');
  });

  it('never enables a privileged web preference', () => {
    expect(mainSource).not.toMatch(/nodeIntegration:\s*true/);
    expect(mainSource).not.toMatch(/contextIsolation:\s*false/);
    expect(mainSource).not.toMatch(/sandbox:\s*false/);
    expect(mainSource).not.toMatch(/webSecurity:\s*false/);
  });

  it('denies external navigation, new windows, permissions, and webviews', () => {
    expect(mainSource).toContain('setWindowOpenHandler');
    expect(mainSource).toContain('will-navigate');
    expect(mainSource).toContain('will-attach-webview');
    expect(mainSource).toContain('setPermissionRequestHandler');
  });
});

describe('preload surface', () => {
  it('exposes exactly one bridge global, from the contract', () => {
    const exposeCalls = preloadSource.match(/exposeInMainWorld/g) ?? [];
    expect(exposeCalls).toHaveLength(1);
    expect(preloadSource).toContain('exposeInMainWorld(BRIDGE_GLOBAL');
  });

  it('names no channel by string literal, so the contract stays the only inventory', () => {
    const literals = preloadSource.match(/'opera-incerta:[^']*'/g) ?? [];
    expect(literals).toEqual([]);
  });

  it('reaches only channels the contract declares', () => {
    const declared = new Set(Object.keys(CHANNELS));
    const used = [...preloadSource.matchAll(/CHANNELS\.([A-Za-z]+)/g)].map((match) => match[1]);

    expect(used.length).toBeGreaterThan(0);
    for (const channel of used) {
      expect(declared.has(channel as string)).toBe(true);
    }
  });

  it('does not hand the renderer the raw IPC object', () => {
    expect(preloadSource).not.toMatch(/exposeInMainWorld\([^,]+,\s*ipcRenderer\s*\)/);
  });
});
