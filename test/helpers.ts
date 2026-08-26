import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export async function mkTmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'd2dr-test-'));
}

/** Create a file (and any parent directories) with the given content. */
export async function writeFile(filePath: string, content: string | Buffer): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content);
}

/** Build a realistic Steam library dir with a Dota 2 replays folder. */
export async function makeSteamLibraryWithReplays(
  baseDir: string,
  replays: { name: string; bytes: number }[],
): Promise<{ libraryDir: string; replayDir: string }> {
  const libraryDir = baseDir;
  const replayDir = path.join(
    libraryDir,
    'steamapps',
    'common',
    'dota 2 beta',
    'game',
    'dota',
    'replays',
  );
  await fs.mkdir(replayDir, { recursive: true });
  for (const replay of replays) {
    await writeFile(path.join(replayDir, replay.name), Buffer.alloc(replay.bytes, 7));
  }
  return { libraryDir, replayDir };
}
