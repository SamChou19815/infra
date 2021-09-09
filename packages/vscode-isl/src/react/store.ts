import type { GitLogEntry } from 'lib-git';
import { Store, createStore } from 'redux';

import type { ExtensionToWebviewMessage } from '../message-types';

export interface GlobalState {
  readonly gitLogs: readonly GitLogEntry[];
}

const initialState: GlobalState = { gitLogs: [] };

function reducer(
  state: GlobalState = initialState,
  message: ExtensionToWebviewMessage
): GlobalState {
  switch (message.type) {
    case 'git-info':
      return { ...state, gitLogs: message.gitLogs };
    default:
      return state;
  }
}

export const globalReduxStore: Store<GlobalState, ExtensionToWebviewMessage> = createStore(reducer);
