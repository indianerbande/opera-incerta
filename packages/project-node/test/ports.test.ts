import { describe, expect, it } from 'vitest';
import {
  PROJECT_DIRECTORY,
  PROJECT_FILES,
  SHEET_EXTENSION,
  type FolderInspection,
  type ProjectFilesystem,
} from '../src/index.js';

describe('project layout constants', () => {
  it('marks a project with a hidden directory holding four purpose-split files', () => {
    expect(PROJECT_DIRECTORY.startsWith('.')).toBe(true);
    expect(Object.values(PROJECT_FILES)).toEqual([
      'project.json',
      'categories.json',
      'structure.json',
      'recent.json',
    ]);
  });

  it('stores sheets as plain Markdown', () => {
    expect(SHEET_EXTENSION).toBe('.md');
  });
});

describe('ProjectFilesystem port', () => {
  it('can be satisfied by a double, so the boundary stays testable without a disk', async () => {
    const inspection: FolderInspection = { kind: 'no-project' };
    const double: Pick<ProjectFilesystem, 'inspectFolder'> = {
      inspectFolder: async () => inspection,
    };

    await expect(double.inspectFolder('/tmp/anywhere')).resolves.toEqual({ kind: 'no-project' });
  });
});
