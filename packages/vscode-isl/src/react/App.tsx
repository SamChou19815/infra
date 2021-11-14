import React from 'react';

import GitGraph from './GitGraph';
import { sendMessageToExtension } from './webview-messages';

export default function App(): JSX.Element {
  return (
    <div>
      <div className="controller-bar">
        <button
          className="control-button"
          onClick={() => sendMessageToExtension({ type: 'reload-html' })}
        >
          Reload Page
        </button>
        <button
          className="control-button"
          onClick={() => sendMessageToExtension({ type: 'fetch-git' })}
        >
          Refresh Git Info
        </button>
      </div>
      <GitGraph />
    </div>
  );
}
