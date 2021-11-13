import React from 'react';
import { render } from 'react-dom';
import { Provider } from 'react-redux';

import App from './App';
import { globalReduxStore } from './store';
import { sendMessageToExtension, startMessageListener } from './webview-messages';

import './index.css';

startMessageListener();
render(
  <Provider store={globalReduxStore}>
    <App />
  </Provider>,
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  document.getElementById('root')!
);
sendMessageToExtension({ type: 'fetch-git' });
