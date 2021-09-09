import { queryGitLog } from '../query';

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
});
