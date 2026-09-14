/**
 * Writes which build this is next to the bundled main process.
 * specification.md §16.
 *
 * Run by the desktop build, after the bundles. The main process reads the
 * record at start and hands it to the renderer, which shows it where an
 * author looks for it when writing a report.
 *
 * It is written at build time because an installed application has no
 * checkout to ask. And it asks Git only about **this** repository: a source
 * archive unpacked inside some other repository would otherwise be given
 * that repository's commit, which would be a confident wrong answer. A build
 * outside a checkout records no revision, and says so.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(desktopRoot, '..', '..');
const target = join(desktopRoot, 'dist', 'build-identity.json');

function git(...args) {
  return execFileSync('git', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

function revision() {
  try {
    if (realpathSync(git('rev-parse', '--show-toplevel')) !== realpathSync(repositoryRoot)) {
      return null;
    }
    return git('describe', '--tags', '--always', '--dirty');
  } catch {
    // No git, or not a checkout: a build without a revision, not a failed build.
    return null;
  }
}

const version = JSON.parse(readFileSync(join(repositoryRoot, 'package.json'), 'utf8')).version ?? null;
const identity = { version, revision: revision() };

mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, `${JSON.stringify(identity, null, 2)}\n`);
console.log(`build identity: ${identity.revision ?? `${identity.version}, no Git revision`}`);
