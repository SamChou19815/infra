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
  return stdout
    .trim()
    .split('\n')
    .map((it) => {
      const [hash, parentHash, authorName, authorEmail, commitTimeString, subject] = it
        .trim()
        .split(GIT_LOG_SEPARATOR);
      assert(hash != null);
      assert(parentHash != null);
      assert(authorName != null);
      assert(authorEmail != null);
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
