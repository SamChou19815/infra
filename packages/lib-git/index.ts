import { assert, checkNotNull } from 'lib-base/general';
import startAsyncProcess from 'lib-base/shell';

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

export interface GitRef {
  readonly hash: string;
  readonly name: string;
}

export interface GitTag extends GitRef, GitCommitTag {
  readonly annotated: boolean;
}

export interface GitRefInfo {
  readonly headHash: string;
  readonly heads: readonly GitRef[];
  readonly tags: readonly GitTag[];
  readonly remotes: readonly GitRef[];
}

export interface GitStatusInfo {
  readonly deleted: readonly string[];
  readonly untracked: readonly string[];
}

export type GitFileStatus = 'A' | 'M' | 'D' | 'R' | 'U';

export interface GitDiffNameStatusRecord {
  readonly type: GitFileStatus;
  readonly oldFilePath: string;
  readonly newFilePath: string;
}

export interface GitDiffNumStatRecord {
  readonly filePath: string;
  readonly additions: number;
  readonly deletions: number;
}

export interface GitCommitTag {
  readonly name: string;
  readonly annotated: boolean;
}

export interface GitCommitRemote {
  readonly name: string;
  /** null => remote not found, otherwise => remote name */
  readonly remote: string | null;
}

export interface GitCommitStash {
  readonly selector: string;
  readonly baseHash: string;
  readonly untrackedFilesHash: string | null;
}

export interface GitCommit {
  readonly hash: string;
  readonly parents: readonly string[];
  readonly author: string;
  readonly email: string;
  readonly date: number;
  readonly message: string;
  readonly heads: readonly string[];
  readonly tags: readonly GitCommitTag[];
  readonly remotes: readonly GitCommitRemote[];
  /** null => not a stash, otherwise => stash info */
  readonly stash: GitCommitStash | null;
}

export interface GitCommitData {
  readonly commits: readonly GitCommit[];
  readonly head: string | null;
  readonly tags: readonly string[];
  readonly moreCommitsAvailable: boolean;
}

export async function queryGitLog(cwd?: string, limit = 100): Promise<readonly GitLogEntry[]> {
  const format = ['%H', '%P', '%an', '%ae', '%ct', '%s'].join(GIT_LOG_SEPARATOR);
  const { stdout } = await startAsyncProcess(
    'git',
    ['-c', 'log.showSignature=false', 'log', `--max-count=${limit}`, `--format="${format}"`],
    cwd
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

export async function queryGitRef(cwd?: string): Promise<GitRefInfo> {
  const { stdout } = await startAsyncProcess('git', ['show-ref', '-d', '--head'], cwd);
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

export async function queryGitStatus(cwd?: string): Promise<GitStatusInfo> {
  const { stdout } = await startAsyncProcess(
    'git',
    ['status', '-s', '--untracked-files=all', '--porcelain', '-z'],
    cwd
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

async function queryGitDiffRaw(
  fromHash: string,
  toHash: string,
  arg: '--numstat' | '--name-status',
  filter: string,
  cwd?: string
): Promise<readonly string[]> {
  let args: string[];
  const diffFilter = `--diff-filter=${filter}`;
  if (fromHash === toHash) {
    args = ['diff-tree', arg, '-r', '--root', '--find-renames', diffFilter, '-z', fromHash];
  } else {
    args = ['diff', arg, '--find-renames', diffFilter, '-z', fromHash];
    if (toHash !== '') args.push(toHash);
  }

  const { stdout } = await startAsyncProcess('git', args, cwd);
  const lines = stdout.split('\0');
  if (fromHash === toHash) lines.shift();
  return lines;
}

export async function queryGitDiffNameStatus(
  fromHash: string,
  toHash: string,
  filter = 'AMDR',
  cwd?: string
): Promise<readonly GitDiffNameStatusRecord[]> {
  const output = await queryGitDiffRaw(fromHash, toHash, '--name-status', filter, cwd);
  const records: GitDiffNameStatusRecord[] = [];
  let i = 0;
  while (i < output.length && output[i] !== '') {
    const type = checkNotNull(output?.[i]?.[0]);
    if (type === 'A' || type === 'D' || type === 'M') {
      const filePath = checkNotNull(output[i + 1]);
      records.push({ type, oldFilePath: filePath, newFilePath: filePath });
      i += 2;
    } else if (type === 'R') {
      records.push({
        type,
        oldFilePath: checkNotNull(output[i + 1]),
        newFilePath: checkNotNull(output[i + 2]),
      });
      i += 3;
    } else {
      break;
    }
  }
  return records;
}

export async function queryGitDiffNumStat(
  fromHash: string,
  toHash: string,
  filter = 'AMDR',
  cwd?: string
): Promise<readonly GitDiffNumStatRecord[]> {
  const output = await queryGitDiffRaw(fromHash, toHash, '--numstat', filter, cwd);
  const records: GitDiffNumStatRecord[] = [];
  let i = 0;
  while (i < output.length && output[i] !== '') {
    const fields = checkNotNull(output[i]).split('\t');
    if (fields.length !== 3) break;
    if (fields[2] !== '') {
      // Add, Modify, or Delete
      records.push({
        filePath: checkNotNull(fields[2]),
        additions: parseInt(checkNotNull(fields[0]), 10),
        deletions: parseInt(checkNotNull(fields[1]), 10),
      });
      i += 1;
    } else {
      // Rename
      records.push({
        filePath: checkNotNull(output[i + 2]),
        additions: parseInt(checkNotNull(fields[0]), 10),
        deletions: parseInt(checkNotNull(fields[1]), 10),
      });
      i += 3;
    }
  }
  return records;
}

export interface GitFileChange {
  readonly oldFilePath: string;
  readonly newFilePath: string;
  readonly type: GitFileStatus;
  readonly additions: number | null;
  readonly deletions: number | null;
}

/** @internal */
export function generateGitFileChanges_EXPOSED_FOR_TESTING(
  nameStatusRecords: readonly GitDiffNameStatusRecord[],
  numStatRecords: readonly GitDiffNumStatRecord[],
  status: GitStatusInfo | null
): readonly GitFileChange[] {
  const fileChanges: { -readonly [K in keyof GitFileChange]: GitFileChange[K] }[] = [];
  const fileLookup: Record<string, number> = {};

  nameStatusRecords.forEach((nameStatusRecord, index) => {
    fileLookup[nameStatusRecord.newFilePath] = index;
    fileChanges.push({
      oldFilePath: nameStatusRecord.oldFilePath,
      newFilePath: nameStatusRecord.newFilePath,
      type: nameStatusRecord.type,
      additions: null,
      deletions: null,
    });
  });

  if (status !== null) {
    status.deleted.forEach((deletedFilePath) => {
      if (typeof fileLookup[deletedFilePath] === 'number') {
        checkNotNull(fileChanges[checkNotNull(fileLookup[deletedFilePath])]).type = 'D';
      } else {
        fileChanges.push({
          oldFilePath: deletedFilePath,
          newFilePath: deletedFilePath,
          type: 'D',
          additions: null,
          deletions: null,
        });
      }
    });
    status.untracked.forEach((untrackedFilePath) => {
      fileChanges.push({
        oldFilePath: untrackedFilePath,
        newFilePath: untrackedFilePath,
        type: 'U',
        additions: null,
        deletions: null,
      });
    });
  }

  numStatRecords.forEach((numStatRecord) => {
    if (typeof fileLookup[numStatRecord.filePath] === 'number') {
      const fileChange = checkNotNull(
        fileChanges[checkNotNull(fileLookup[numStatRecord.filePath])]
      );
      fileChange.additions = numStatRecord.additions;
      fileChange.deletions = numStatRecord.deletions;
    }
  });

  return fileChanges;
}
