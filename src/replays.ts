import { promises as fs } from 'node:fs';
import path from 'node:path';

/** Replay folder location relative to any Steam library directory. */
export const REPLAY_DIR_SEGMENTS = [
  'steamapps',
  'common',
  'dota 2 beta',
  'game',
  'dota',
  'replays',
] as const;

/** Dota 2 replay files are Source engine demo files. Only these are deleted. */
export const REPLAY_FILE_EXTENSION = '.dem';

export interface ReplayFile {
  path: string;
  sizeBytes: number;
}

export interface ReplayDirScan {
  dir: string;
  files: ReplayFile[];
  totalBytes: number;
}

export interface DeleteSummary {
  dirsScanned: number;
  filesDeleted: number;
  bytesFreed: number;
  failures: { path: string; error: string }[];
  dryRun: boolean;
}

async function isDirectory(p: string): Promise<boolean> {
  try {
    return (await fs.stat(p)).isDirectory();
  } catch {
    return false;
  }
}

/** Locate existing Dota 2 replay folders across all Steam library dirs. */
export async function findReplayDirs(libraryDirs: string[]): Promise<string[]> {
  const found: string[] = [];
  for (const lib of libraryDirs) {
    const replayDir = path.join(lib, ...REPLAY_DIR_SEGMENTS);
    if (await isDirectory(replayDir)) found.push(replayDir);
  }
  return found;
}

/**
 * List every replay file (*.dem, case-insensitive) directly inside a replay
 * folder. Anything else in the folder is left untouched.
 */
export async function scanReplayDir(dir: string): Promise<ReplayDirScan> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: ReplayFile[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.toLowerCase().endsWith(REPLAY_FILE_EXTENSION)) continue;
    const fullPath = path.join(dir, entry.name);
    try {
      const stat = await fs.stat(fullPath);
      files.push({ path: fullPath, sizeBytes: stat.size });
    } catch {
      // File vanished between readdir and stat; skip it.
    }
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  return { dir, files, totalBytes: files.reduce((sum, f) => sum + f.sizeBytes, 0) };
}

/** Scan every replay dir. */
export async function scanAll(dirs: string[]): Promise<ReplayDirScan[]> {
  const scans: ReplayDirScan[] = [];
  for (const dir of dirs) scans.push(await scanReplayDir(dir));
  return scans;
}

/**
 * Delete all scanned replay files. With dryRun=true nothing is removed and
 * the summary reflects what *would* be freed.
 */
export async function deleteReplays(
  scans: ReplayDirScan[],
  options: { dryRun?: boolean } = {},
): Promise<DeleteSummary> {
  const dryRun = options.dryRun ?? false;
  const summary: DeleteSummary = {
    dirsScanned: scans.length,
    filesDeleted: 0,
    bytesFreed: 0,
    failures: [],
    dryRun,
  };

  for (const scan of scans) {
    for (const file of scan.files) {
      if (dryRun) {
        summary.filesDeleted += 1;
        summary.bytesFreed += file.sizeBytes;
        continue;
      }
      try {
        await fs.unlink(file.path);
        summary.filesDeleted += 1;
        summary.bytesFreed += file.sizeBytes;
      } catch (err) {
        summary.failures.push({
          path: file.path,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
  return summary;
}

/** Human-readable byte formatting (binary units). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KiB', 'MiB', 'GiB', 'TiB'];
  let value = bytes;
  let unit = 'B';
  for (const next of units) {
    if (value < 1024) break;
    value /= 1024;
    unit = next;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${unit}`;
}
