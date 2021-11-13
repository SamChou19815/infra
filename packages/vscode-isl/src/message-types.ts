import type { GitCommitData } from 'lib-git/git-data-source';

export type ExtensionToWebviewMessage = {
  readonly type: 'git-commit-data';
  readonly gitCommitData: GitCommitData;
};
export type WebviewToExtensionMessage = { readonly type: 'fetch-git' };
