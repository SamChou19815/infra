import GitDataSource from '@forked/git-graph/git-data-source';
import INLINE_CSS from 'virtual-module-webview-content-css';
import BUNDLED_JS from 'virtual-module-webview-content-js';
import * as vscode from 'vscode';

import type { ExtensionToWebviewMessage, WebviewToExtensionMessage } from './message-types';

export function activate(context: vscode.ExtensionContext): void {
  let currentPanel: vscode.WebviewPanel | undefined = undefined;

  context.subscriptions.push(
    vscode.commands.registerCommand('dev-sam.vscode-isl.start', () => {
      const columnToShowIn = vscode.window.activeTextEditor
        ? vscode.window.activeTextEditor.viewColumn
        : undefined;

      if (currentPanel) {
        // If we already have a panel, show it in the target column
        currentPanel.reveal(columnToShowIn);
      } else {
        // Otherwise, create a new panel
        currentPanel = vscode.window.createWebviewPanel(
          'dev-sam.vscode-isl', // Identifies the type of the webview. Used internally
          'Interactive SmartLog', // Title of the panel displayed to the user
          vscode.ViewColumn.One, // Editor column to show the new webview panel in.
          { enableScripts: true } // Webview options. More on these later.
        );
        const webview = currentPanel.webview;
        webview.html = getWebviewHTML();

        const sendMessage = (message: ExtensionToWebviewMessage) => webview.postMessage(message);

        webview.onDidReceiveMessage(
          async (message: WebviewToExtensionMessage) => {
            switch (message.type) {
              case 'fetch-git': {
                const source = new GitDataSource(getRepoRoots()[0]);
                const info = await source.getRepoInfo([]);
                const gitCommitData = await source.getCommits(
                  null,
                  100,
                  info.remotes,
                  [],
                  info.stashes
                );
                await sendMessage({ type: 'git-commit-data', gitCommitData });
                return;
              }
            }
          },
          undefined,
          context.subscriptions
        );

        // Reset when the current panel is closed
        currentPanel.onDidDispose(
          () => {
            currentPanel = undefined;
          },
          null,
          context.subscriptions
        );
      }
    })
  );
}

export function deactivate(): void {}

function getRepoRoots(): readonly string[] {
  return (vscode.workspace.workspaceFolders || []).map((it) => it.uri.fsPath);
}

function getWebviewHTML(): string {
  return `<!DOCTYPE html><html><head>
<style>
${INLINE_CSS}
</style>
</head><body><div id="root"></div>
<script type="text/javascript">
${BUNDLED_JS}
</script>
</body></html>
`;
}
