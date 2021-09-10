import { assert, checkNotNull } from 'lib-base/general';
import startAsyncProcess from 'lib-base/shell';

const DRIVE_LETTER_PATH_REGEX = /^[a-z]:\//;
const EOL_REGEX = /\r\n|\r|\n/g;
const INVALID_BRANCH_REGEXP = /^\(.* .*\)$/;
const REMOTE_HEAD_BRANCH_REGEXP = /^remotes\/.*\/HEAD$/;
const GIT_LOG_SEPARATOR = 'XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb';

export interface GitLogEntry {
  readonly hash: string;
  readonly parentHash: string | null;
  readonly authorName: string;
  readonly authorEmail: string;
  readonly commitTime: Date;
  readonly subject: string;
}

export async function queryGitLog(limit = 100): Promise<readonly GitLogEntry[]> {
  const format = ['%H', '%P', '%an', '%ae', '%ct', '%s'].join(GIT_LOG_SEPARATOR);
  const { stdout } = await startAsyncProcess(
    'git',
    '-c',
    'log.showSignature=false',
    'log',
    `--max-count=${limit}`,
    `--format="${format}"`
  );
  const lines = stdout.trim().split(EOL_REGEX);
  return lines.map((it) => {
    const [hash, parentHash, authorName, authorEmail, commitTimeString, subject] = it
      .trim()
      .split(GIT_LOG_SEPARATOR);
    assert(hash != null && parentHash != null && authorName != null && authorEmail != null);
    const commitTime = new Date(parseInt(checkNotNull(commitTimeString), 10) * 1000);
    assert(subject != null);
    return {
      hash,
      parentHash: parentHash || null,
      authorName,
      authorEmail,
      commitTime,
      subject,
    };
  });
}

export interface GitRef {
  readonly hash: string;
  readonly name: string;
}

export interface GitTag extends GitRef {
  readonly annotated: boolean;
}

//

export interface GitRefInfo {
  readonly headHash: string;
  readonly heads: readonly GitRef[];
  readonly tags: readonly GitTag[];
  readonly remotes: readonly GitRef[];
}

export async function queryGitRef(): Promise<GitRefInfo> {
  const { stdout } = await startAsyncProcess('git', 'show-ref', '-d', '--head');
  const lines = stdout.trim().split(EOL_REGEX);
  const heads: GitRef[] = [];
  const tags: GitTag[] = [];
  const remotes: GitRef[] = [];
  let headHash: string | undefined;

  lines.forEach((line) => {
    const parts = line.split(' ');
    if (line.length < 2) return;
    const [hash, ref] = parts;
    assert(hash != null && ref != null);

    if (ref.startsWith('refs/heads/')) {
      heads.push({ hash, name: ref.substring(11) });
    } else if (ref.startsWith('refs/tags/')) {
      const annotated = ref.endsWith('^{}');
      const name = annotated ? ref.substring(10, ref.length - 3) : ref.substring(10);
      tags.push({ hash, name, annotated });
    } else if (ref.startsWith('refs/remotes/')) {
      if (!ref.endsWith('/HEAD')) remotes.push({ hash, name: ref.substring(13) });
    } else if (ref === 'HEAD') {
      headHash = hash;
    }
  });

  return { headHash: checkNotNull(headHash), heads, tags, remotes };
}

export interface GitStatusInfo {
  readonly deleted: readonly string[];
  readonly untracked: readonly string[];
}

export async function queryGitStatus(): Promise<GitStatusInfo> {
  const { stdout } = await startAsyncProcess(
    'git',
    'status',
    '-s',
    '--untracked-files=all',
    '--porcelain',
    '-z'
  );
  const output = stdout.split('\0');
  let i = 0;
  let path = '',
    c1 = '',
    c2 = '';
  const deleted: string[] = [];
  const untracked: string[] = [];
  while (i < output.length && output[i] !== '') {
    const entry = checkNotNull(output[i]);
    console.log(entry);
    if (entry.length < 4) break;
    path = entry.substring(3);
    c1 = entry.substring(0, 1);
    c2 = entry.substring(1, 2);
    if (c1 === 'D' || c2 === 'D') deleted.push(path);
    else if (c1 === '?' || c2 === '?') untracked.push(path);

    if (c1 === 'R' || c2 === 'R' || c1 === 'C' || c2 === 'C') {
      // Renames or copies
      i += 2;
    } else {
      i += 1;
    }
  }
  return { deleted, untracked };
}
