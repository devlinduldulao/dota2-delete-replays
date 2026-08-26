import { promises as fs } from 'node:fs';
import path from 'node:path';
import { candidateSteamRoots, defaultContext, type PlatformContext } from './platform.js';

export class SteamNotFoundError extends Error {
  constructor(searched: string[]) {
    super(
      'Could not find a Steam installation on this machine.\n' +
        'Searched:\n' +
        searched.map((p) => `  - ${p}`).join('\n') +
        '\n\nIf your Steam library lives somewhere unusual, point me at the ' +
        'replays folder directly with: dota2-delete-replays --path "<dir>"',
    );
    this.name = 'SteamNotFoundError';
  }
}

async function isDirectory(p: string): Promise<boolean> {
  try {
    return (await fs.stat(p)).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Parse Valve's libraryfolders.vdf and return every library path it lists.
 * The format is a simple key-value tree; library entries look like:
 *   "1"
 *   {
 *       "path"      "D:\\SteamLibrary"
 *       ...
 *   }
 * A regex over "path" entries is sufficient and avoids a VDF dependency.
 */
export function parseLibraryFoldersVdf(vdfContent: string): string[] {
  const paths: string[] = [];
  const re = /"path"\s+"((?:[^"\\]|\\.)*)"/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(vdfContent)) !== null) {
    const raw = match[1];
    if (!raw) continue;
    // VDF escapes backslashes: "D:\\SteamLibrary" -> D:\SteamLibrary
    paths.push(raw.replace(/\\\\/g, '\\'));
  }
  return paths;
}

/** Steam roots that actually exist on this machine. */
export async function findSteamRoots(
  ctx: PlatformContext = defaultContext(),
): Promise<string[]> {
  const candidates = candidateSteamRoots(ctx);
  const existing: string[] = [];
  for (const root of candidates) {
    if (await isDirectory(root)) existing.push(root);
  }
  if (existing.length === 0) throw new SteamNotFoundError(candidates);
  return existing;
}

/**
 * Every Steam library directory (the root itself plus any extra libraries
 * declared in steamapps/libraryfolders.vdf), de-duplicated and filtered to
 * directories that exist.
 */
export async function findLibraryDirs(steamRoots: string[]): Promise<string[]> {
  const dirs = new Set<string>();
  for (const root of steamRoots) {
    dirs.add(path.normalize(root));
    const vdfPath = path.join(root, 'steamapps', 'libraryfolders.vdf');
    try {
      const content = await fs.readFile(vdfPath, 'utf8');
      for (const lib of parseLibraryFoldersVdf(content)) {
        if (await isDirectory(lib)) dirs.add(path.normalize(lib));
      }
    } catch {
      // No libraryfolders.vdf (or unreadable): the root itself is the only library.
    }
  }
  return [...dirs];
}
