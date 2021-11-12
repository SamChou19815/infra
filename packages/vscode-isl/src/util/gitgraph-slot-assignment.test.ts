import gitGraphSlotAssignment from './gitgraph-slot-assignment';
import GITGRAPH_TEST_DATA from './gitgraph-test-data';

describe('gitgraph-slot-assignment', () => {
  it('gitGraphSlotAssignment test', () => {
    const commits = gitGraphSlotAssignment(GITGRAPH_TEST_DATA.commits);
    const numberOfColumns = commits.reduce((acc, c) => Math.max(acc, c.columnId), -1) + 1;
    const graphString = commits
      .map((it) => {
        const nodesString = Array.from(new Array(numberOfColumns).keys())
          .map((i) => (i === it.columnId ? 'o' : ' '))
          .join(' ');
        return `${nodesString} [${it.heads.join(' ')}] "${it.message}"`;
      })
      .join('\n');
    expect(graphString).toBe(
      `
o   [master] "main 5"
  o [branch4] "Merge branch 'master' into branch4"
o   [] "main 4"
  o [] "branch 4"
o   [] "Merge branch 'master' into branch3"
o   [] "Merge branch 'branch2'"
o   [] "mainline concurrent with two other branches"
  o [] "branch 3"
  o [] "branch 2"
o   [] "Merge branch 'branch1'"
o   [] "branch 1 commit 2"
o   [] "branch 1 commit 1"
  o [] "main 2"
o   [] "main 1"
o   [] "Initial commit"
`.trim()
    );
  });
});
