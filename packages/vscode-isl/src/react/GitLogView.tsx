import React from 'react';
import { useSelector } from 'react-redux';

import type { GlobalState } from './store';

export default function GitLogView(): JSX.Element {
  const gitLogs = useSelector((state: GlobalState) => state.gitLogs);

  return (
    <div>
      <h2>Git Log</h2>
      <div>Count: {gitLogs.length}</div>
      <ul>
        {gitLogs.map((logEntry) => (
          <li key={logEntry.hash}>
            {logEntry.commitTime}: {logEntry.subject}
          </li>
        ))}
      </ul>
    </div>
  );
}
