import os from 'node:os';

/**
 * Everything the resolver needs to know about the machine, injected so
 * tests can simulate any OS / home directory / environment on any host.
 */
export interface PlatformContext {
  platform: NodeJS.Platform;
  homeDir: string;
  env: NodeJS.ProcessEnv;
}

export function defaultContext(): PlatformContext {
  return {
    platform: process.platform,
    homeDir: os.homedir(),
    env: process.env,
  };
}

export class UnsupportedPlatformError extends Error {
  constructor(platform: string) {
    super(
      `Unsupported operating system: "${platform}". ` +
        `dota2-delete-replays supports Windows (win32), macOS (darwin), and Linux.`,
    );
    this.name = 'UnsupportedPlatformError';
  }
}

/**
 * Default Steam installation roots per operating system.
 *
 * macOS:   ~/Library/Application Support/Steam
 * Linux:   ~/.steam/steam, ~/.local/share/Steam, plus Flatpak and Snap installs
 * Windows: %ProgramFiles(x86)%\Steam, %ProgramFiles%\Steam, %LocalAppData%\Steam
 *
 * Additional Steam library folders (other drives) are discovered separately
 * by parsing <root>/steamapps/libraryfolders.vdf.
 */
export function candidateSteamRoots(ctx: PlatformContext): string[] {
  const { platform, homeDir, env } = ctx;

  switch (platform) {
    case 'darwin':
      return [joinPosix(homeDir, 'Library/Application Support/Steam')];

    case 'linux':
      return [
        joinPosix(homeDir, '.steam/steam'),
        joinPosix(homeDir, '.local/share/Steam'),
        joinPosix(homeDir, '.steam/root'),
        joinPosix(homeDir, '.var/app/com.valvesoftware.Steam/.local/share/Steam'),
        joinPosix(homeDir, 'snap/steam/common/.local/share/Steam'),
      ];

    case 'win32': {
      const roots: string[] = [];
      const programFilesX86 = env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)';
      const programFiles = env['ProgramFiles'] ?? 'C:\\Program Files';
      const localAppData = env['LOCALAPPDATA'];
      roots.push(joinWin(programFilesX86, 'Steam'));
      roots.push(joinWin(programFiles, 'Steam'));
      if (localAppData) roots.push(joinWin(localAppData, 'Steam'));
      return roots;
    }

    default:
      throw new UnsupportedPlatformError(String(platform));
  }
}

/** Join with forward slashes; harmless on POSIX, and Node on Windows accepts them too. */
function joinPosix(...parts: string[]): string {
  return parts.join('/').replace(/\/{2,}/g, '/');
}

/** Join Windows paths, tolerating either separator in the inputs. */
function joinWin(...parts: string[]): string {
  return parts
    .join('\\')
    .replace(/[\\/]{2,}/g, '\\')
    .replace(/^\\([a-zA-Z]:)/, '$1');
}
