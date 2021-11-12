import {
  DeepWriteable,
  ErrorInfo,
  GitCommit,
  GitCommitDetails,
  GitCommitStash,
  GitConfigLocation,
  GitFileChange,
  GitFileStatus,
  GitPushBranchMode,
  GitRepoConfig,
  GitRepoConfigBranches,
  GitStash,
  GitTagDetails,
  Writeable,
} from './types';
import { UNCOMMITTED, getPathFromStr, spawnGitRaw } from './utils';

const EOL_REGEX = /\r\n|\r|\n/g;
const INVALID_BRANCH_REGEXP = /^\(.* .*\)$/;
const REMOTE_HEAD_BRANCH_REGEXP = /^remotes\/.*\/HEAD$/;
const GIT_LOG_SEPARATOR = 'XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb';

const gitFormatCommitDetails: string = [
  '%H',
  '%P', // Hash & Parent Information
  '%an',
  '%ae',
  '%at',
  '%cn',
  '%ce',
  '%ct', // Author / Commit Information
  '%B', // Body
].join(GIT_LOG_SEPARATOR);

const gitFormatLog: string = [
  '%H',
  '%P', // Hash & Parent Information
  '%an',
  '%ae',
  '%ct', // Author / Commit Information
  '%s', // Subject
].join(GIT_LOG_SEPARATOR);

const gitFormatStash: string = [
  '%H',
  '%P',
  '%gD', // Hash, Parent & Selector Information
  '%an',
  '%ae',
  '%ct', // Author / Commit Information
  '%s', // Subject
].join(GIT_LOG_SEPARATOR);

export default class GitDataSource {
  constructor(private readonly repo: string) {}

  /* Get Data Methods - Core */

  public async getRepoInfo(hideRemotes: readonly string[]): Promise<GitRepoInfo> {
    const [{ branches, head }, remotes, stashes] = await Promise.all([
      this.getBranches(hideRemotes),
      this.spawnGit(['remote'], (stdout) => {
        const lines = stdout.split(EOL_REGEX);
        lines.pop();
        return lines;
      }),
      this.getStashes(),
    ]);
    return { branches, head, remotes, stashes };
  }

  /**
   * Get the commits in a repository.
   *
   * @param branches The list of branch heads to display, or NULL (show all).
   * @param maxCommits The maximum number of commits to return.
   * @param remotes An array of known remotes.
   * @param hideRemotes An array of hidden remotes.
   * @param stashes An array of all stashes in the repository.
   * @returns The commits in the repository.
   */
  public async getCommits(
    branches: readonly string[] | null,
    maxCommits: number,
    remotes: readonly string[],
    hideRemotes: readonly string[],
    stashes: ReadonlyArray<GitStash>
  ): Promise<GitCommitData> {
    // eslint-disable-next-line prefer-const
    let [commits, refData] = await Promise.all([
      this.getLog(branches, maxCommits + 1, remotes, hideRemotes, stashes),
      this.getRefs(hideRemotes).then(
        (it) => it,
        (errorMessage: string) => errorMessage
      ),
    ]);
    let i;
    const moreCommitsAvailable = commits.length === maxCommits + 1;
    if (moreCommitsAvailable) commits.pop();

    // It doesn't matter if getRefs() was rejected if no commits exist
    if (typeof refData === 'string') {
      // getRefs() returned an error message (string)
      if (commits.length > 0) {
        // Commits exist, throw the error
        throw refData;
      } else {
        // No commits exist, so getRefs() will always return an error.
        // Set refData to the default value
        refData = { head: null, heads: [], tags: [], remotes: [] };
      }
    }

    if (refData.head !== null) {
      for (i = 0; i < commits.length; i++) {
        if (refData.head === commits[i].hash) {
          const numUncommittedChanges = await this.getUncommittedChanges();
          if (numUncommittedChanges > 0) {
            commits.unshift({
              hash: UNCOMMITTED,
              parents: [refData.head],
              author: '*',
              email: '',
              date: Math.round(new Date().getTime() / 1000),
              message: `Uncommitted Changes (${numUncommittedChanges})`,
            });
          }
          break;
        }
      }
    }

    const commitNodes: DeepWriteable<GitCommit>[] = [];
    const commitLookup: { [hash: string]: number } = {};

    for (i = 0; i < commits.length; i++) {
      commitLookup[commits[i].hash] = i;
      commitNodes.push({ ...commits[i], heads: [], tags: [], remotes: [], stash: null });
    }

    /* Insert Stashes */
    const toAdd: { index: number; data: GitStash }[] = [];
    for (i = 0; i < stashes.length; i++) {
      if (typeof commitLookup[stashes[i].hash] === 'number') {
        commitNodes[commitLookup[stashes[i].hash]].stash = {
          selector: stashes[i].selector,
          baseHash: stashes[i].baseHash,
          untrackedFilesHash: stashes[i].untrackedFilesHash,
        };
      } else if (typeof commitLookup[stashes[i].baseHash] === 'number') {
        toAdd.push({ index: commitLookup[stashes[i].baseHash], data: stashes[i] });
      }
    }
    toAdd.sort((a, b) => (a.index !== b.index ? a.index - b.index : b.data.date - a.data.date));
    for (i = toAdd.length - 1; i >= 0; i--) {
      const stash = toAdd[i].data;
      commitNodes.splice(toAdd[i].index, 0, {
        hash: stash.hash,
        parents: [stash.baseHash],
        author: stash.author,
        email: stash.email,
        date: stash.date,
        message: stash.message,
        heads: [],
        tags: [],
        remotes: [],
        stash: {
          selector: stash.selector,
          baseHash: stash.baseHash,
          untrackedFilesHash: stash.untrackedFilesHash,
        },
      });
    }
    for (i = 0; i < commitNodes.length; i++) {
      // Correct commit lookup after stashes have been spliced in
      commitLookup[commitNodes[i].hash] = i;
    }

    /* Annotate Heads */
    for (i = 0; i < refData.heads.length; i++) {
      if (typeof commitLookup[refData.heads[i].hash] === 'number') {
        commitNodes[commitLookup[refData.heads[i].hash]].heads.push(refData.heads[i].name);
      }
    }

    for (i = 0; i < refData.tags.length; i++) {
      if (typeof commitLookup[refData.tags[i].hash] === 'number') {
        commitNodes[commitLookup[refData.tags[i].hash]].tags.push({
          name: refData.tags[i].name,
          annotated: refData.tags[i].annotated,
        });
      }
    }

    /* Annotate Remotes */
    for (i = 0; i < refData.remotes.length; i++) {
      if (typeof commitLookup[refData.remotes[i].hash] === 'number') {
        const name = refData.remotes[i].name;
        // eslint-disable-next-line no-shadow
        const remote = remotes.find((remote) => name.startsWith(`${remote}/`));
        commitNodes[commitLookup[refData.remotes[i].hash]].remotes.push({
          name,
          remote: remote ? remote : null,
        });
      }
    }

    return {
      commits: commitNodes,
      head: refData.head,
      tags: unique(refData.tags.map((tag) => tag.name)),
      moreCommitsAvailable,
    };
  }

  public async getConfig(remotes: readonly string[]): Promise<GitRepoConfig> {
    const [consolidatedConfigs, localConfigs] = await Promise.all([
      this.getConfigList(),
      this.getConfigList(GitConfigLocation.Local),
    ]);
    const branches: GitRepoConfigBranches = {};
    Object.keys(localConfigs).forEach((key) => {
      if (key.startsWith('branch.')) {
        if (key.endsWith('.remote')) {
          const branchName = key.substring(7, key.length - 7);
          branches[branchName] = {
            pushRemote:
              typeof branches[branchName] !== 'undefined' ? branches[branchName].pushRemote : null,
            remote: localConfigs[key],
          };
        } else if (key.endsWith('.pushremote')) {
          const branchName = key.substring(7, key.length - 11);
          branches[branchName] = {
            pushRemote: localConfigs[key],
            remote:
              typeof branches[branchName] !== 'undefined' ? branches[branchName].remote : null,
          };
        }
      }
    });

    return {
      branches,
      pushDefault: getConfigValue(consolidatedConfigs, 'remote.pushdefault'),
      remotes: remotes.map((remote) => ({
        name: remote,
        url: getConfigValue(localConfigs, `remote.${remote}.url`),
        pushUrl: getConfigValue(localConfigs, `remote.${remote}.pushurl`),
      })),
    };
  }

  /* Get Data Methods - Commit Details View */

  public getCommitDetails(commitHash: string, hasParents: boolean): Promise<GitCommitDetails> {
    const fromCommit = commitHash + (hasParents ? '^' : '');
    return Promise.all([
      this.getCommitDetailsBase(commitHash),
      this.getDiffNameStatus(fromCommit, commitHash),
      this.getDiffNumStat(fromCommit, commitHash),
    ]).then((results) => {
      results[0].fileChanges = generateFileChanges(results[1], results[2], null);
      return results[0];
    });
  }

  public async getStashDetails(
    commitHash: string,
    stash: GitCommitStash
  ): Promise<GitCommitDetails> {
    const results = await Promise.all([
      this.getCommitDetailsBase(commitHash),
      this.getDiffNameStatus(stash.baseHash, commitHash),
      this.getDiffNumStat(stash.baseHash, commitHash),
      stash.untrackedFilesHash !== null
        ? this.getDiffNameStatus(stash.untrackedFilesHash, stash.untrackedFilesHash)
        : Promise.resolve([]),
      stash.untrackedFilesHash !== null
        ? this.getDiffNumStat(stash.untrackedFilesHash, stash.untrackedFilesHash)
        : Promise.resolve([]),
    ]);
    results[0].fileChanges = generateFileChanges(results[1], results[2], null);
    if (stash.untrackedFilesHash !== null) {
      generateFileChanges(results[3], results[4], null).forEach((fileChange) => {
        if (fileChange.type === GitFileStatus.Added) {
          fileChange.type = GitFileStatus.Untracked;
          results[0].fileChanges.push(fileChange);
        }
      });
    }
    return results[0];
  }

  public async getUncommittedDetails(): Promise<GitCommitDetails> {
    const results = await Promise.all([
      this.getDiffNameStatus('HEAD', ''),
      this.getDiffNumStat('HEAD', ''),
      this.getStatus(),
    ]);
    return {
      hash: UNCOMMITTED,
      parents: [],
      author: '',
      authorEmail: '',
      authorDate: 0,
      committer: '',
      committerEmail: '',
      committerDate: 0,
      body: '',
      fileChanges: generateFileChanges(results[0], results[1], results[2]),
    };
  }

  /**
   * Get the comparison details for the Commit Comparison View.
   * @param repo The path of the repository.
   * @param fromHash The commit hash the comparison is from.
   * @param toHash The commit hash the comparison is to.
   * @returns The comparison details.
   */
  public async getCommitComparison(
    fromHash: string,
    toHash: string
  ): Promise<readonly GitFileChange[]> {
    const results = await Promise.all<
      DiffNameStatusRecord[],
      DiffNumStatRecord[],
      GitStatusFiles | null
    >([
      this.getDiffNameStatus(fromHash, toHash === UNCOMMITTED ? '' : toHash),
      this.getDiffNumStat(fromHash, toHash === UNCOMMITTED ? '' : toHash),
      toHash === UNCOMMITTED ? this.getStatus() : Promise.resolve(null),
    ]);
    return generateFileChanges(results[0], results[1], results[2]);
  }

  /**
   * Get the contents of a file at a specific revision.
   * @param repo The path of the repository.
   * @param commitHash The commit hash specifying the revision of the file.
   * @param filePath The path of the file relative to the repositories root.
   * @returns The file contents.
   */
  public getCommitFile(commitHash: string, filePath: string) {
    return this.spawnGit(['show', `${commitHash}:${filePath}`], (it) => it);
  }

  /* Get Data Methods - General */

  public getCommitSubject(commitHash: string): Promise<string | null> {
    return this.spawnGit(
      ['-c', 'log.showSignature=false', 'log', '--format=%s', '-n', '1', commitHash, '--'],
      (stdout) => {
        return stdout.trim().replace(/\s+/g, ' ');
      }
    ).then(
      (subject) => subject,
      () => null
    );
  }

  public getRemoteUrl(remote: string): Promise<string | null> {
    return this.spawnGit(['config', '--get', `remote.${remote}.url`], (stdout) => {
      return stdout.split(EOL_REGEX)[0];
    }).then(
      (url) => url,
      () => null
    );
  }

  public getNewPathOfRenamedFile(commitHash: string, oldFilePath: string) {
    return this.getDiffNameStatus(commitHash, '', 'R')
      .then((renamed) => {
        const renamedRecordForFile = renamed.find((record) => record.oldFilePath === oldFilePath);
        return renamedRecordForFile ? renamedRecordForFile.newFilePath : null;
      })
      .catch(() => null);
  }

  public getTagDetails(tagName: string): Promise<GitTagDetailsData> {
    const ref = `refs/tags/${tagName}`;
    return this.spawnGit(
      [
        'for-each-ref',
        ref,
        `--format=${[
          '%(objectname)',
          '%(taggername)',
          '%(taggeremail)',
          '%(taggerdate:unix)',
          '%(contents:signature)',
          '%(contents)',
        ].join(GIT_LOG_SEPARATOR)}`,
      ],
      (stdout) => {
        const data = stdout.split(GIT_LOG_SEPARATOR);
        return {
          hash: data[0],
          taggerName: data[1],
          taggerEmail: data[2].substring(
            data[2].startsWith('<') ? 1 : 0,
            data[2].length - (data[2].endsWith('>') ? 1 : 0)
          ),
          taggerDate: parseInt(data[3], 10),
          message: removeTrailingBlankLines(
            data.slice(5).join(GIT_LOG_SEPARATOR).replace(data[4], '').split(EOL_REGEX)
          ).join('\n'),
          signed: data[4] !== '',
        };
      }
    )
      .then(async (tag) => ({
        details: {
          hash: tag.hash,
          taggerName: tag.taggerName,
          taggerEmail: tag.taggerEmail,
          taggerDate: tag.taggerDate,
          message: tag.message,
        },
        error: null,
      }))
      .catch((errorMessage) => ({
        details: null,
        error: errorMessage,
      }));
  }

  /* Git Action Methods - Remote Sync */

  /**
   * Fetch from the repositories remote(s).
   *
   * @param remote The remote to fetch, or NULL (fetch all remotes).
   * @param prune Is pruning enabled.
   * @param pruneTags Should tags be pruned.
   * @returns The ErrorInfo from the executed command.
   */
  public fetch(remote: string | null, prune: boolean, pruneTags: boolean) {
    const args = ['fetch', remote === null ? '--all' : remote];

    if (prune) {
      args.push('--prune');
    }
    if (pruneTags) {
      if (!prune) {
        return Promise.resolve(
          `In order to Prune Tags, pruning must also be enabled when fetching from ${
            remote !== null ? 'a remote' : 'remote(s)'
          }.`
        );
      }
      args.push('--prune-tags');
    }

    return this.runGitCommand(args);
  }

  /**
   * Push a branch to a remote.
   *
   * @param branchName The name of the branch to push.
   * @param remote The remote to push the branch to.
   * @param setUpstream Set the branches upstream.
   * @param mode The mode of the push.
   * @returns The ErrorInfo from the executed command.
   */
  public pushBranch(
    branchName: string,
    remote: string,
    setUpstream: boolean,
    mode: GitPushBranchMode
  ) {
    const args = ['push'];
    args.push(remote, branchName);
    if (setUpstream) args.push('--set-upstream');
    if (mode !== GitPushBranchMode.Normal) args.push(`--${mode}`);

    return this.runGitCommand(args);
  }

  /* Git Action Methods - Branches */

  public checkoutBranch(branchName: string, remoteBranch: string | null) {
    const args = ['checkout'];
    if (remoteBranch === null) args.push(branchName);
    else args.push('-b', branchName, remoteBranch);

    return this.runGitCommand(args);
  }

  /**
   * Create a branch at a commit.
   *
   * @param branchName The name of the branch.
   * @param commitHash The hash of the commit the branch should be created at.
   * @param checkout Check out the branch after it is created.
   * @param force Force create the branch, replacing an existing branch with the same name (if it exists).
   * @returns The ErrorInfo's from the executed command(s).
   */
  public async createBranch(
    branchName: string,
    commitHash: string,
    checkout: boolean,
    force: boolean
  ) {
    const args = [];
    if (checkout && !force) {
      args.push('checkout', '-b');
    } else {
      args.push('branch');
      if (force) {
        args.push('-f');
      }
    }
    args.push(branchName, commitHash);

    const statuses = [await this.runGitCommand(args)];
    if (statuses[0] === null && checkout && force) {
      statuses.push(await this.checkoutBranch(branchName, null));
    }
    return statuses;
  }

  /**
   * Delete a branch in a repository.
   *
   * @param branchName The name of the branch.
   * @param forceDelete Should the delete be forced.
   * @returns The ErrorInfo from the executed command.
   */
  public deleteBranch(branchName: string, forceDelete: boolean) {
    const args = ['branch', '--delete'];
    if (forceDelete) args.push('--force');
    args.push(branchName);

    return this.runGitCommand(args);
  }

  public async deleteRemoteBranch(branchName: string, remote: string) {
    const remoteStatus = await this.runGitCommand(['push', remote, '--delete', branchName]);
    if (remoteStatus !== null && new RegExp('remote ref does not exist', 'i').test(remoteStatus)) {
      const trackingBranchStatus = await this.runGitCommand([
        'branch',
        '-d',
        '-r',
        `${remote}/${branchName}`,
      ]);
      return trackingBranchStatus === null
        ? null
        : `Branch does not exist on the remote, deleting the remote tracking branch ${remote}/${branchName}.\n${trackingBranchStatus}`;
    }
    return remoteStatus;
  }

  /**
   * Fetch a remote branch into a local branch.
   *
   * @param remote The name of the remote containing the remote branch.
   * @param remoteBranch The name of the remote branch.
   * @param localBranch The name of the local branch.
   * @param force Force fetch the remote branch.
   * @returns The ErrorInfo from the executed command.
   */
  public fetchIntoLocalBranch(
    remote: string,
    remoteBranch: string,
    localBranch: string,
    force: boolean
  ) {
    const args = ['fetch'];
    if (force) {
      args.push('-f');
    }
    args.push(remote, `${remoteBranch}:${localBranch}`);
    return this.runGitCommand(args);
  }

  public renameBranch(oldName: string, newName: string) {
    return this.runGitCommand(['branch', '-m', oldName, newName]);
  }

  /* Git Action Methods - Stash */

  /**
   * Apply a stash in a repository.
   *
   * @param selector The selector of the stash.
   * @param reinstateIndex Is `--index` enabled.
   * @returns The ErrorInfo from the executed command.
   */
  public applyStash(selector: string, reinstateIndex: boolean) {
    const args = ['stash', 'apply'];
    if (reinstateIndex) args.push('--index');
    args.push(selector);

    return this.runGitCommand(args);
  }

  /**
   * Pop a stash in a repository.
   *
   * @param selector The selector of the stash.
   * @param reinstateIndex Is `--index` enabled.
   * @returns The ErrorInfo from the executed command.
   */
  public popStash(selector: string, reinstateIndex: boolean) {
    const args = ['stash', 'pop'];
    if (reinstateIndex) args.push('--index');
    args.push(selector);

    return this.runGitCommand(args);
  }

  /* Private Data Providers */

  private getBranches(hideRemotes: readonly string[]): Promise<GitBranchData> {
    const args = ['branch'];
    args.push('-a');
    args.push('--no-color');

    const hideRemotePatterns = hideRemotes.map((remote) => `remotes/${remote}/`);

    return this.spawnGit(args, (stdout) => {
      const branches: string[] = [];
      let head: string | null = null;
      const lines = stdout.split(EOL_REGEX);
      for (let i = 0; i < lines.length - 1; i++) {
        const name = lines[i].substring(2).split(' -> ')[0];
        if (
          INVALID_BRANCH_REGEXP.test(name) ||
          hideRemotePatterns.some((pattern) => name.startsWith(pattern)) ||
          REMOTE_HEAD_BRANCH_REGEXP.test(name)
        ) {
          continue;
        }

        if (lines[i][0] === '*') {
          head = name;
          branches.unshift(name);
        } else {
          branches.push(name);
        }
      }
      return { branches, head };
    });
  }

  private getCommitDetailsBase(commitHash: string) {
    return this.spawnGit(
      [
        '-c',
        'log.showSignature=false',
        'show',
        '--quiet',
        commitHash,
        `--format=${gitFormatCommitDetails}`,
      ],
      (stdout): DeepWriteable<GitCommitDetails> => {
        const commitInfo = stdout.split(GIT_LOG_SEPARATOR);
        return {
          hash: commitInfo[0],
          parents: commitInfo[1] !== '' ? commitInfo[1].split(' ') : [],
          author: commitInfo[2],
          authorEmail: commitInfo[3],
          authorDate: parseInt(commitInfo[4], 10),
          committer: commitInfo[5],
          committerEmail: commitInfo[6],
          committerDate: parseInt(commitInfo[7], 10),
          body: removeTrailingBlankLines(
            commitInfo.slice(8).join(GIT_LOG_SEPARATOR).split(EOL_REGEX)
          ).join('\n'),
          fileChanges: [],
        };
      }
    );
  }

  /**
   * Get the configuration list of a repository.
   * @param repo The path of the repository.
   * @param location The location of the configuration to be listed.
   * @returns A set of key-value pairs of Git configuration records.
   */
  private getConfigList(location?: GitConfigLocation): Promise<GitConfigSet> {
    const args = ['--no-pager', 'config', '--list', '-z', '--includes'];
    if (location) {
      args.push(`--${location}`);
    }

    return this.spawnGit(args, (stdout) => {
      const configs: GitConfigSet = {},
        keyValuePairs = stdout.split('\0');
      const numPairs = keyValuePairs.length - 1;
      let comps, key;
      for (let i = 0; i < numPairs; i++) {
        comps = keyValuePairs[i].split(EOL_REGEX);
        key = comps.shift();
        if (key == null) throw new Error();
        configs[key] = comps.join('\n');
      }
      return configs;
    }).catch((errorMessage) => {
      if (typeof errorMessage === 'string') {
        const message = errorMessage.toLowerCase();
        if (
          message.startsWith('fatal: unable to read config file') &&
          message.endsWith('no such file or directory')
        ) {
          // If the Git command failed due to the configuration file not existing, return an empty list instead of throwing the exception
          return {};
        }
      } else {
        // eslint-disable-next-line no-param-reassign
        errorMessage = 'An unexpected error occurred while spawning the Git child process.';
      }
      throw errorMessage;
    });
  }

  /**
   * Get the diff `--name-status` records.
   *
   * @param fromHash The revision the diff is from.
   * @param toHash The revision the diff is to.
   * @param filter The types of file changes to retrieve (defaults to `AMDR`).
   * @returns An array of `--name-status` records.
   */
  private getDiffNameStatus(fromHash: string, toHash: string, filter = 'AMDR') {
    return this.execDiff(fromHash, toHash, '--name-status', filter).then((output) => {
      const records: DiffNameStatusRecord[] = [];
      let i = 0;
      while (i < output.length && output[i] !== '') {
        const type = <GitFileStatus>output[i][0];
        if (
          type === GitFileStatus.Added ||
          type === GitFileStatus.Deleted ||
          type === GitFileStatus.Modified
        ) {
          // Add, Modify, or Delete
          const p = getPathFromStr(output[i + 1]);
          records.push({ type, oldFilePath: p, newFilePath: p });
          i += 2;
        } else if (type === GitFileStatus.Renamed) {
          // Rename
          records.push({
            type,
            oldFilePath: getPathFromStr(output[i + 1]),
            newFilePath: getPathFromStr(output[i + 2]),
          });
          i += 3;
        } else {
          break;
        }
      }
      return records;
    });
  }

  /**
   * Get the diff `--numstat` records.
   * @param repo The path of the repository.
   * @param fromHash The revision the diff is from.
   * @param toHash The revision the diff is to.
   * @param filter The types of file changes to retrieve (defaults to `AMDR`).
   * @returns An array of `--numstat` records.
   */
  private getDiffNumStat(fromHash: string, toHash: string, filter = 'AMDR') {
    return this.execDiff(fromHash, toHash, '--numstat', filter).then((output) => {
      const records: DiffNumStatRecord[] = [];
      let i = 0;
      while (i < output.length && output[i] !== '') {
        const fields = output[i].split('\t');
        if (fields.length !== 3) break;
        if (fields[2] !== '') {
          // Add, Modify, or Delete
          records.push({
            filePath: getPathFromStr(fields[2]),
            additions: parseInt(fields[0], 10),
            deletions: parseInt(fields[1], 10),
          });
          i += 1;
        } else {
          // Rename
          records.push({
            filePath: getPathFromStr(output[i + 2]),
            additions: parseInt(fields[0], 10),
            deletions: parseInt(fields[1], 10),
          });
          i += 3;
        }
      }
      return records;
    });
  }

  /**
   * Get the raw commits in a repository.
   *
   * @param branches The list of branch heads to display, or NULL (show all).
   * @param num The maximum number of commits to return.
   * @param remotes An array of the known remotes.
   * @param hideRemotes An array of hidden remotes.
   * @param stashes An array of all stashes in the repository.
   * @returns An array of commits.
   */
  private getLog(
    branches: readonly string[] | null,
    num: number,
    remotes: readonly string[],
    hideRemotes: readonly string[],
    stashes: readonly GitStash[]
  ) {
    const args = [
      '-c',
      'log.showSignature=false',
      'log',
      `--max-count=${num}`,
      `--format=${gitFormatLog}`,
      `--author-date-order`,
    ];
    if (branches !== null) {
      for (let i = 0; i < branches.length; i++) {
        args.push(branches[i]);
      }
    } else {
      // Show All
      args.push('--branches');
      args.push('--tags');
      if (hideRemotes.length === 0) {
        args.push('--remotes');
      } else {
        remotes
          .filter((remote) => !hideRemotes.includes(remote))
          .forEach((remote) => {
            args.push(`--glob=refs/remotes/${remote}`);
          });
      }

      // Add the unique list of base hashes of stashes, so that commits only referenced by stashes are displayed
      const stashBaseHashes = stashes.map((stash) => stash.baseHash);
      stashBaseHashes
        .filter((hash, index) => stashBaseHashes.indexOf(hash) === index)
        .forEach((hash) => args.push(hash));

      args.push('HEAD');
    }
    args.push('--');

    return this.spawnGit(args, (stdout) => {
      const lines = stdout.split(EOL_REGEX);
      const commits: GitCommitRecord[] = [];
      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i].split(GIT_LOG_SEPARATOR);
        if (line.length !== 6) break;
        commits.push({
          hash: line[0],
          parents: line[1] !== '' ? line[1].split(' ') : [],
          author: line[2],
          email: line[3],
          date: parseInt(line[4], 10),
          message: line[5],
        });
      }
      return commits;
    });
  }

  private getRefs(hideRemotes: readonly string[]) {
    const args = ['show-ref'];
    args.push('-d', '--head');

    const hideRemotePatterns = hideRemotes.map((remote) => `refs/remotes/${remote}/`);

    return this.spawnGit(args, (stdout) => {
      const refData: GitRefData = { head: null, heads: [], tags: [], remotes: [] };
      const lines = stdout.split(EOL_REGEX);
      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i].split(' ');
        if (line.length < 2) continue;

        const hash = line.shift();
        if (hash == null) throw new Error();
        const ref = line.join(' ');

        if (ref.startsWith('refs/heads/')) {
          refData.heads.push({ hash, name: ref.substring(11) });
        } else if (ref.startsWith('refs/tags/')) {
          const annotated = ref.endsWith('^{}');
          refData.tags.push({
            hash,
            name: annotated ? ref.substring(10, ref.length - 3) : ref.substring(10),
            annotated,
          });
        } else if (ref.startsWith('refs/remotes/')) {
          if (
            !hideRemotePatterns.some((pattern) => ref.startsWith(pattern)) &&
            !ref.endsWith('/HEAD')
          ) {
            refData.remotes.push({ hash, name: ref.substring(13) });
          }
        } else if (ref === 'HEAD') {
          refData.head = hash;
        }
      }
      return refData;
    });
  }

  private getStashes(): Promise<GitStash[]> {
    return this.spawnGit(['reflog', `--format=${gitFormatStash}`, 'refs/stash', '--'], (stdout) => {
      const lines = stdout.split(EOL_REGEX);
      const stashes: GitStash[] = [];
      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i].split(GIT_LOG_SEPARATOR);
        if (line.length !== 7 || line[1] === '') continue;
        const parentHashes = line[1].split(' ');
        stashes.push({
          hash: line[0],
          baseHash: parentHashes[0],
          untrackedFilesHash: parentHashes.length === 3 ? parentHashes[2] : null,
          selector: line[2],
          author: line[3],
          email: line[4],
          date: parseInt(line[5], 10),
          message: line[6],
        });
      }
      return stashes;
    }).catch(() => []);
  }

  private getUncommittedChanges() {
    return this.spawnGit(['status', `--untracked-files=all`, '--porcelain'], (stdout) => {
      const numLines = stdout.split(EOL_REGEX).length;
      return numLines > 1 ? numLines - 1 : 0;
    });
  }

  /** Get the untracked and deleted files that are not staged or committed.  */
  private getStatus() {
    return this.spawnGit(
      ['status', '-s', `--untracked-files=all`, '--porcelain', '-z'],

      (stdout) => {
        const output = stdout.split('\0');
        let i = 0;
        const status: GitStatusFiles = { deleted: [], untracked: [] };
        let path = '';
        let c1 = '';
        let c2 = '';
        while (i < output.length && output[i] !== '') {
          if (output[i].length < 4) break;
          path = output[i].substring(3);
          c1 = output[i].substring(0, 1);
          c2 = output[i].substring(1, 2);
          if (c1 === 'D' || c2 === 'D') status.deleted.push(path);
          else if (c1 === '?' || c2 === '?') status.untracked.push(path);

          if (c1 === 'R' || c2 === 'R' || c1 === 'C' || c2 === 'C') {
            // Renames or copies
            i += 2;
          } else {
            i += 1;
          }
        }
        return status;
      }
    );
  }

  /* Private Utils */

  /**
   * Get the diff between two revisions.
   * @param repo The path of the repository.
   * @param fromHash The revision the diff is from.
   * @param toHash The revision the diff is to.
   * @param arg Sets the data reported from the diff.
   * @param filter The types of file changes to retrieve.
   * @returns The diff output.
   */
  private execDiff(
    fromHash: string,
    toHash: string,
    arg: '--numstat' | '--name-status',
    filter: string
  ) {
    let args: string[];
    if (fromHash === toHash) {
      args = [
        'diff-tree',
        arg,
        '-r',
        '--root',
        '--find-renames',
        `--diff-filter=${filter}`,
        '-z',
        fromHash,
      ];
    } else {
      args = ['diff', arg, '--find-renames', `--diff-filter=${filter}`, '-z', fromHash];
      if (toHash !== '') args.push(toHash);
    }

    return this.spawnGit(args, (stdout) => {
      const lines = stdout.split('\0');
      if (fromHash === toHash) lines.shift();
      return lines;
    });
  }

  /**
   * Run a Git command (typically for a Git Graph View action).
   * @param args The arguments to pass to Git.
   * @param repo The repository to run the command in.
   * @returns The returned ErrorInfo (suitable for being sent to the Git Graph View).
   */
  private runGitCommand(args: readonly string[]): Promise<ErrorInfo> {
    return spawnGitRaw(this.repo, args, () => null).catch((errorMessage: string) => errorMessage);
  }

  /**
   * Spawn Git, with the return value resolved from `stdout` as a string.
   * @param args The arguments to pass to Git.
   * @param repo The repository to run the command in.
   * @param resolveValue A callback invoked to resolve the data from `stdout`.
   */
  private spawnGit<T>(args: readonly string[], resolveValue: (stdout: string) => T): Promise<T> {
    return spawnGitRaw(this.repo, args, (stdout) => resolveValue(stdout.toString()));
  }
}

/**
 * Generates the file changes from the diff output and status information.
 * @param nameStatusRecords The `--name-status` records.
 * @param numStatRecords The `--numstat` records.
 * @param status The deleted and untracked files.
 * @returns An array of file changes.
 */
function generateFileChanges(
  nameStatusRecords: DiffNameStatusRecord[],
  numStatRecords: DiffNumStatRecord[],
  status: GitStatusFiles | null
) {
  const fileChanges: Writeable<GitFileChange>[] = [];
  const fileLookup: { [file: string]: number } = {};
  let i = 0;

  for (i = 0; i < nameStatusRecords.length; i++) {
    fileLookup[nameStatusRecords[i].newFilePath] = fileChanges.length;
    fileChanges.push({
      oldFilePath: nameStatusRecords[i].oldFilePath,
      newFilePath: nameStatusRecords[i].newFilePath,
      type: nameStatusRecords[i].type,
      additions: null,
      deletions: null,
    });
  }

  if (status !== null) {
    let filePath;
    for (i = 0; i < status.deleted.length; i++) {
      filePath = getPathFromStr(status.deleted[i]);
      if (typeof fileLookup[filePath] === 'number') {
        fileChanges[fileLookup[filePath]].type = GitFileStatus.Deleted;
      } else {
        fileChanges.push({
          oldFilePath: filePath,
          newFilePath: filePath,
          type: GitFileStatus.Deleted,
          additions: null,
          deletions: null,
        });
      }
    }
    for (i = 0; i < status.untracked.length; i++) {
      filePath = getPathFromStr(status.untracked[i]);
      fileChanges.push({
        oldFilePath: filePath,
        newFilePath: filePath,
        type: GitFileStatus.Untracked,
        additions: null,
        deletions: null,
      });
    }
  }

  for (i = 0; i < numStatRecords.length; i++) {
    if (typeof fileLookup[numStatRecords[i].filePath] === 'number') {
      fileChanges[fileLookup[numStatRecords[i].filePath]].additions = numStatRecords[i].additions;
      fileChanges[fileLookup[numStatRecords[i].filePath]].deletions = numStatRecords[i].deletions;
    }
  }

  return fileChanges;
}

/**
 * Get the specified config value from a set of key-value config pairs.
 * @param configs A set key-value pairs of Git configuration records.
 * @param key The key of the desired config.
 * @returns The value for `key` if it exists, otherwise NULL.
 */
function getConfigValue(configs: GitConfigSet, key: string) {
  return typeof configs[key] !== 'undefined' ? configs[key] : null;
}

/**
 * Remove trailing blank lines from an array of lines.
 * @param lines The array of lines.
 * @returns The same array.
 */
function removeTrailingBlankLines(lines: string[]) {
  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines;
}

/**
 * Get all the unique strings from an array of strings.
 * @param items The array of strings with duplicates.
 * @returns An array of unique strings.
 */
function unique(items: readonly string[]) {
  const uniqueItems: { [item: string]: true } = {};
  // eslint-disable-next-line no-return-assign
  items.forEach((item) => (uniqueItems[item] = true));
  return Object.keys(uniqueItems);
}

/* Types */

interface DiffNameStatusRecord {
  readonly type: GitFileStatus;
  readonly oldFilePath: string;
  readonly newFilePath: string;
}

interface DiffNumStatRecord {
  readonly filePath: string;
  readonly additions: number;
  readonly deletions: number;
}

interface GitBranchData {
  readonly branches: readonly string[];
  readonly head: string | null;
}

interface GitCommitRecord {
  readonly hash: string;
  readonly parents: string[];
  readonly author: string;
  readonly email: string;
  readonly date: number;
  readonly message: string;
}

interface GitCommitData {
  readonly commits: readonly GitCommit[];
  readonly head: string | null;
  readonly tags: readonly string[];
  readonly moreCommitsAvailable: boolean;
}

type GitConfigSet = { [key: string]: string };

interface GitRef {
  readonly hash: string;
  readonly name: string;
}

interface GitRefTag extends GitRef {
  readonly annotated: boolean;
}

interface GitRefData {
  head: string | null;
  heads: GitRef[];
  readonly tags: GitRefTag[];
  readonly remotes: GitRef[];
}

interface GitRepoInfo extends GitBranchData {
  readonly remotes: string[];
  readonly stashes: GitStash[];
}

interface GitStatusFiles {
  readonly deleted: string[];
  readonly untracked: string[];
}

interface GitTagDetailsData {
  readonly details: GitTagDetails | null;
  readonly error: ErrorInfo;
}
