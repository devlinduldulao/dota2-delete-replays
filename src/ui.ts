import chalk from 'chalk';

/**
 * Central styling for terminal output. chalk automatically disables colors
 * when output is not a TTY or NO_COLOR is set, so piped/--json usage stays clean.
 */
export const VERSION = '1.1.0';

export const ui = {
  banner(): string {
    return `${chalk.bold.hex('#C23B2A')('🎮 dota2-delete-replays')} ${chalk.dim(`v${VERSION}`)}`;
  },
  dir(p: string): string {
    return chalk.bold(p);
  },
  count(n: number): string {
    return chalk.cyan.bold(String(n));
  },
  size(s: string): string {
    return chalk.yellow(s);
  },
  success(s: string): string {
    return chalk.green.bold(s);
  },
  warn(s: string): string {
    return chalk.yellow(s);
  },
  error(s: string): string {
    return chalk.red(s);
  },
  dim(s: string): string {
    return chalk.dim(s);
  },
  info(s: string): string {
    return chalk.cyan(s);
  },
  total(s: string): string {
    return chalk.bold(s);
  },
};
