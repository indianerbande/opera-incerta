import { bootstrapApplication } from '@angular/platform-browser';
import { provideZonelessChangeDetection } from '@angular/core';
import { BRIDGE_GLOBAL, type OperaIncertaBridge } from '@opera-incerta/desktop-contract';

/**
 * One bundle, two windows. specification.md §8.5.
 *
 * Which window this is comes from the main process, not from a query string
 * the page could rewrite. Without a shell — the development harness — the
 * launcher is shown, since there is no project to work in.
 */
async function windowRole(): Promise<'welcome' | 'project'> {
  const bridge = (globalThis as Record<string, unknown>)[BRIDGE_GLOBAL] as
    | OperaIncertaBridge
    | undefined;
  if (bridge === undefined) {
    return 'welcome';
  }
  try {
    return await bridge.windowRole();
  } catch {
    return 'welcome';
  }
}

void windowRole()
  .then(async (role) =>
    role === 'project'
      ? (await import('./app/app.component.js')).AppComponent
      : (await import('./app/welcome/welcome.component.js')).WelcomeComponent,
  )
  .then((rootComponent) =>
    bootstrapApplication(rootComponent, {
      providers: [provideZonelessChangeDetection()],
    }),
  )
  .catch((error: unknown) => {
    console.error('Opera Incerta renderer bootstrap failed.', error);
  });
