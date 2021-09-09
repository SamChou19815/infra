import type { GitLogEntry } from 'lib-git';

export type ExtensionToWebviewMessage = {
  readonly type: 'git-info';
  readonly gitLogs: readonly GitLogEntry[];
};
export type WebviewToExtensionMessage = { readonly type: 'fetch-git' };
