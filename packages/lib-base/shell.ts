import { spawn } from 'child_process';

export default function startAsyncProcess(
  command: string,
  ...commandArguments: readonly string[]
): Promise<{ readonly success: boolean; readonly stdout: string }> {
  const childProcess = spawn(command, commandArguments, {
    shell: true,
    stdio: ['ignore', 'pipe', 'ignore'],
  });

  let collector = '';
  childProcess.stdout.on('data', (chunk) => {
    collector += chunk.toString();
  });

  return new Promise((resolve) => {
    childProcess.on('close', (code) => {
      const success = code === 0;
      resolve({ success, stdout: collector });
    });
  });
}
