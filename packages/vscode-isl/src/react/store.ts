import type { GitCommitData } from '@forked/git-graph/git-data-source';
import { Store, createStore } from 'redux';

import type { ExtensionToWebviewMessage } from '../message-types';

export interface GlobalState {
  readonly gitCommitData: GitCommitData | null;
}

const initialState: GlobalState = { gitCommitData: null };

function reducer(
  state: GlobalState = initialState,
  message: ExtensionToWebviewMessage
): GlobalState {
  switch (message.type) {
    case 'git-commit-data':
      return { ...state, gitCommitData: message.gitCommitData };
    default:
      return state;
  }
}

export const globalReduxStore: Store<GlobalState, ExtensionToWebviewMessage> = createStore(reducer);
