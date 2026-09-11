import { effect, signal, type Signal } from '@angular/core';
import { resolveColorScheme, type AccentPalette, type ColorScheme } from '@opera-incerta/core';

/**
 * Puts the visual system on the root element. specification.md §8.8.
 *
 * Two attributes and one question to the machine. `system` is resolved here
 * rather than in CSS — a second copy of the dark tokens under
 * `prefers-color-scheme` would be the same declarations twice — and the
 * machine is asked again whenever it changes its mind, so an author who
 * follows the system follows it while the application is running.
 *
 * Both windows need this: the launcher is as much the application as the
 * workbench, and a launcher in the wrong scheme is the first thing an author
 * would see.
 */
export function startAppearance(
  root: HTMLElement,
  scheme: Signal<ColorScheme>,
  palette: Signal<AccentPalette>,
): () => void {
  const query = matchMedia('(prefers-color-scheme: dark)');
  const prefersDark = signal(query.matches);
  const follow = (event: MediaQueryListEvent): void => prefersDark.set(event.matches);
  query.addEventListener('change', follow);

  const stop = effect(() => {
    root.dataset['colorScheme'] = resolveColorScheme(scheme(), prefersDark());
    root.dataset['colorPalette'] = palette();
  });

  return () => {
    query.removeEventListener('change', follow);
    stop.destroy();
  };
}
