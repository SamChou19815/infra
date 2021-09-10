import { queryGitLog, queryGitRef } from '..';

describe('lib-git/query', () => {
  it('queryGitLog works', async () => {
    const result = await queryGitLog(10);
    result.forEach(({ hash, authorName, authorEmail, commitTime, subject }) => {
      expect(hash).toBeTruthy();
      expect(authorName).toBeTruthy();
      expect(authorEmail).toContain('@');
      expect(commitTime).toBeInstanceOf(Date);
      expect(subject).toBeTruthy();
    });
  });

  it('queryGitRef works', async () => {
    const { headHash, heads, tags, remotes } = await queryGitRef();
    expect(headHash).toBeTruthy();
    [...heads, ...tags, ...remotes].forEach(({ hash, name }) => {
      expect(hash).toBeTruthy();
      expect(name).toBeTruthy();
    });
  });
});
