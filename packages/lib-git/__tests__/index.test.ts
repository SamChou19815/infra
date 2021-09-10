import {
  queryGitLog,
  queryGitRef,
  queryGitStatus,
  queryGitDiffNameStatus,
  queryGitDiffNumStat,
  generateGitFileChanges_EXPOSED_FOR_TESTING,
} from '..';

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

  it('queryGitStatus works', async () => {
    const { deleted, untracked } = await queryGitStatus();
    [...deleted, ...untracked].forEach((filename) => expect(filename).toBeTruthy());
  });

  it('queryGitDiffNameStatus works', async () => {
    const records = await queryGitDiffNameStatus('HEAD', '');
    records.forEach(({ type, oldFilePath, newFilePath }) => {
      expect(type).toBeTruthy();
      expect(oldFilePath).toBeTruthy();
      expect(newFilePath).toBeTruthy();
    });
  });

  it('queryGitDiffNumStat works', async () => {
    const records = await queryGitDiffNumStat('HEAD', '');
    records.forEach(({ filePath, additions, deletions }) => {
      expect(filePath).toBeTruthy();
      expect(additions).toBeGreaterThanOrEqual(0);
      expect(deletions).toBeGreaterThanOrEqual(0);
    });
  });

  it('generateGitFileChanges_EXPOSED_FOR_TESTING works', async () => {
    const [nameStatusRecords, numStatRecords, status] = await Promise.all([
      queryGitDiffNameStatus('HEAD', ''),
      queryGitDiffNumStat('HEAD', ''),
      queryGitStatus(),
    ]);
    const changes = generateGitFileChanges_EXPOSED_FOR_TESTING(
      nameStatusRecords,
      numStatRecords,
      status
    );
    changes.forEach(({ type, oldFilePath, newFilePath }) => {
      expect(type).toBeTruthy();
      expect(oldFilePath).toBeTruthy();
      expect(newFilePath).toBeTruthy();
    });
  });
});
