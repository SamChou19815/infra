const coloredTerminalSection = (colorID: number): ColoredSectionFunction => {
  if (!process.stderr.isTTY) return (content) => content;
  return (content) => `\u001b[${colorID}m${content}\u001b[0m`;
};

type ColoredSectionFunction = (content: string) => string;

export const RED: ColoredSectionFunction = coloredTerminalSection(31);
export const GREEN: ColoredSectionFunction = coloredTerminalSection(32);
export const YELLOW: ColoredSectionFunction = coloredTerminalSection(33);
export const BLUE: ColoredSectionFunction = coloredTerminalSection(34);
export const MAGENTA: ColoredSectionFunction = coloredTerminalSection(35);
export const CYAN: ColoredSectionFunction = coloredTerminalSection(36);

const spinner = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export async function asyncTaskWithSpinner<T>(
  getMessage: (passedTime: string) => string,
  asyncTask: () => Promise<T>
): Promise<T> {
  if (!process.stderr.isTTY) return asyncTask();

  let iteration = 0;
  const startTime = new Date().getTime();
  const interval = setInterval(
    () => {
      const passedTime = `${((new Date().getTime() - startTime) / 1000).toFixed(1)}s`;
      const message = getMessage(passedTime);
      const frame = spinner[iteration % 10];
      process.stderr.write(YELLOW(`${message} ${frame}\r`));
      iteration += 1;
    },
    process.stderr.isTTY ? 40 : 1000
  );
  const result = await asyncTask();
  clearInterval(interval);
  return result;
}
