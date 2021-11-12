import { existsSync } from 'fs';
import { mkdir, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

import extract from 'extract-zip';

const zipPath = join(__dirname, '..', '..', 'fixtures', 'git-playground.zip');
const tmpOutPath = resolve(tmpdir(), 'dev-sam-git-playground');

export default async function withPlayGround<T>(
  runner: (repoPath: string) => Promise<T>
): Promise<T> {
  await rm(tmpOutPath, { recursive: true, force: true });
  if (!existsSync(tmpOutPath)) await mkdir(tmpOutPath, { recursive: true });
  try {
    await extract(zipPath, { dir: tmpOutPath });
    return await runner(join(tmpOutPath, 'git-playground'));
  } finally {
    await rm(tmpOutPath, { recursive: true, force: true });
  }
}
