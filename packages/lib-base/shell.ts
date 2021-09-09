import { spawn } from 'child_process';

export default function startAsyncProcess(
  command: string,
  commandArguments: readonly string[],
  cwd?: string
): Promise<{ readonly success: boolean; readonly stdout: string }> {
  const childProcess = spawn(command, commandArguments, {
    shell: true,
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let collector = '';
  childProcess.stdout.on('data', (chunk) => {
    collector += chunk.toString();
  });
  childProcess.stderr.on('data', (chunk) => {
    // eslint-disable-next-line no-console
    console.error(chunk.toString());
  });

  return new Promise((resolve) => {
    childProcess.on('close', (code) => {
      const success = code === 0;
      resolve({ success, stdout: collector });
    });
  });
}
