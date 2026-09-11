/**
 * Editor spike, host half. testing.md §2.8.
 *
 * Runs the criteria in a real Chromium renderer and reports the result. The
 * exit code is the verdict: a spike that cannot fail is not evidence.
 */
import { join } from 'node:path';
import { BrowserWindow, app } from 'electron';

interface CriterionResult {
  readonly id: number;
  readonly name: string;
  readonly passed: boolean;
  readonly detail: Record<string, unknown>;
}

const PAGE = join(__dirname, '..', 'src', 'index.html');

void app.whenReady().then(async () => {
  const window = new BrowserWindow({
    width: 1000,
    height: 800,
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  });

  try {
    await window.loadFile(PAGE);

    // The criteria wait for real frames, so the result appears asynchronously.
    let result: { criteria: readonly CriterionResult[] } | null = null;
    for (let attempt = 0; attempt < 100 && result === null; attempt += 1) {
      result = (await window.webContents.executeJavaScript(
        'globalThis.__spikeResult ?? null',
      )) as { criteria: readonly CriterionResult[] } | null;
      if (result === null) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    if (result === null || result.criteria.length === 0) {
      console.error('spike produced no result');
      app.exit(1);
      return;
    }

    console.log('CodeMirror 6 editor spike — testing.md §2.8\n');
    for (const criterion of result.criteria) {
      const mark = criterion.passed ? 'PASS' : 'FAIL';
      console.log(`${mark}  ${criterion.id}. ${criterion.name}`);
      console.log(`      ${JSON.stringify(criterion.detail)}`);
    }

    const failed = result.criteria.filter((criterion) => !criterion.passed);
    console.log(
      `\n${result.criteria.length - failed.length}/${result.criteria.length} criteria passed`,
    );
    app.exit(failed.length === 0 ? 0 : 1);
  } catch (error: unknown) {
    console.error('spike failed to run:', error);
    app.exit(1);
  }
});
