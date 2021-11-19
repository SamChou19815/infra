/* eslint-disable no-console */

import { GREEN, BLUE, MAGENTA, CYAN, asyncTaskWithSpinner } from './console';
import startAsyncProcess from './shell';
import workspacesTargetDeterminator from './target-determinator';

export default async function incrementalTask(commandName: string): Promise<boolean> {
  const workspacesToReCompile = await workspacesTargetDeterminator();

  workspacesToReCompile.forEach(({ name }) => {
    console.error(BLUE(`[i] Need to run \`${commandName}\` on workspace \`${name}\`.`));
  });

  let workspacesRemaining = workspacesToReCompile.length;
  const statusAndStdErrorList = await asyncTaskWithSpinner(
    (passedTime) => {
      const workspaceText =
        workspacesRemaining === 1 ? '1 workspace' : `${workspacesRemaining} workspaces`;
      return `[?] Running command on ${workspaceText} (${passedTime})`;
    },
    () =>
      Promise.all(
        workspacesToReCompile.map(async ({ name: workspace }) => {
          const { success, stdout } = await startAsyncProcess('yarn', [
            'workspace',
            workspace,
            commandName,
          ]);
          workspacesRemaining -= 1;
          return [workspace, success, stdout] as const;
        })
      )
  );

  const failedWorkspacesRuns = statusAndStdErrorList.filter((it) => !it[1]);
  const globalStdErrorCollector = failedWorkspacesRuns
    .map(
      ([workspace, , stdout]) => `${CYAN(`> yarn workspace ${workspace} ${commandName}`)}
${stdout}\n`
    )
    .join('');

  if (failedWorkspacesRuns.length === 0) {
    console.error(GREEN(`[✓] All commands have finished successfully.`));
    return true;
  }
  console.error(MAGENTA('[!] Some commands finished with errors.'));
  console.error();
  console.error(globalStdErrorCollector.trim());

  return false;
}
