/**
 * The production entry point of the Electron main process. SPEC.md §5.3.
 *
 * Everything the shell does lives in `shell.ts`; this file only starts it
 * with the native behaviour. The smoke has an entry of its own
 * (`smoke/main.ts`) and is bundled separately, so nothing of it ships.
 */
import { startShell } from './shell.js';

startShell();
