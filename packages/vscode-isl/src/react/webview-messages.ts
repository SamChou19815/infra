import type { WebviewToExtensionMessage, ExtensionToWebviewMessage } from '../message-types';
import { globalReduxStore } from './store';

// @ts-expect-error: acquireVsCodeApi not in typedef.
const vscodeAPI: { postMessage(m: WebviewToExtensionMessage): void } = acquireVsCodeApi();

export function sendMessageToExtension(message: WebviewToExtensionMessage): void {
  vscodeAPI.postMessage(message);
}

export function startMessageListener(): void {
  // Handle the message inside the webview
  window.addEventListener('message', (event) => {
    const message: ExtensionToWebviewMessage = event.data;
    globalReduxStore.dispatch(message);
  });
}
