import startAsyncProcess from './shell';
import {
  NamedYarnInvididualWorkspaceInformation,
  YarnWorkspacesJson,
  readGeneratedYarnWorkspacesJson,
} from './workspaces-json';

async function queryChangedFilesSince(pathPrefix: string): Promise<readonly string[]> {
  async function queryFromGitDiffResult(base: string, head?: string) {
    const trimmed = (
      await startAsyncProcess('git', [
        'diff',
        base,
        ...(head ? [head] : []),
        '--name-only',
        '--',
        pathPrefix,
      ])
    ).stdout
      .toString()
      .trim();

    return trimmed === '' ? [] : trimmed.split('\n');
  }

  if (process.env.CI) {
    return queryFromGitDiffResult('HEAD^', 'HEAD');
  }
  return queryFromGitDiffResult('origin/main');
}

async function workspaceHasChangedFilesExcludingBundledBinaries(
  workspacesJson: YarnWorkspacesJson,
  workspaceName: string
): Promise<boolean> {
  const dependencyChain = workspacesJson.information[workspaceName]?.dependencyChain ?? [];
  const results = await Promise.all(
    dependencyChain.map(async (item) => {
      const dependencyWorkspaceName = workspacesJson.information[item]?.workspaceLocation ?? '.';
      const changedFiles = await queryChangedFilesSince(dependencyWorkspaceName);
      return changedFiles.length > 0;
    })
  );
  return results.some((it) => it);
}

export default async function workspacesTargetDeterminator(): Promise<
  readonly NamedYarnInvididualWorkspaceInformation[]
> {
  const workspacesJson = await readGeneratedYarnWorkspacesJson();
  await startAsyncProcess('git', ['add', '.']);
  const needRebuilds = await Promise.all(
    workspacesJson.topologicallyOrdered.map(async (workspaceName) => {
      const needRebuild = await workspaceHasChangedFilesExcludingBundledBinaries(
        workspacesJson,
        workspaceName
      );
      return [workspaceName, needRebuild] as const;
    })
  );
  return needRebuilds
    .filter(([, needRebuild]) => needRebuild)
    .map(([name]) => ({ name, ...workspacesJson.information[name] }));
}
