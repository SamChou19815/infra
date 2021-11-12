import GitDataSource from '@forked/git-graph/git-data-source';

import GITGRAPH_TEST_DATA from './gitgraph-test-data';
import withPlayGround from './with-playground';

describe('gitgraph-test-data', () => {
  it('Consistency test', async () => {
    await withPlayGround(async (repoPath) => {
      const source = new GitDataSource(repoPath);
      const info = await source.getRepoInfo([]);
      const gitCommitData = await source.getCommits(null, 100, info.remotes, [], info.stashes);
      expect(gitCommitData).toEqual(GITGRAPH_TEST_DATA);
    });
  });
});
