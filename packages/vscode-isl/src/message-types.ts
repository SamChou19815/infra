import type { GitCommitData } from '@forked/git-graph/git-data-source';

export type ExtensionToWebviewMessage = {
  readonly type: 'git-commit-data';
  readonly gitCommitData: GitCommitData;
};
export type WebviewToExtensionMessage = { readonly type: 'fetch-git' };
