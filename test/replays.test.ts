import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  deleteReplays,
  findReplayDirs,
  formatBytes,
  scanAll,
  scanReplayDir,
} from '../src/replays.js';
import { makeSteamLibraryWithReplays, mkTmpDir, writeFile } from './helpers.js';

let tmp: string;

beforeEach(async () => {
  tmp = await mkTmpDir();
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('findReplayDirs', () => {
  it('finds the replays folder inside a Steam library (happy path)', async () => {
    const { libraryDir, replayDir } = await makeSteamLibraryWithReplays(
      path.join(tmp, 'Steam'),
      [],
    );
    const dirs = await findReplayDirs([libraryDir]);
    expect(dirs).toEqual([replayDir]);
  });

  it('finds replay folders across multiple libraries (happy path)', async () => {
    const a = await makeSteamLibraryWithReplays(path.join(tmp, 'LibA'), []);
    const b = await makeSteamLibraryWithReplays(path.join(tmp, 'LibB'), []);
    const dirs = await findReplayDirs([a.libraryDir, b.libraryDir]);
    expect(dirs.sort()).toEqual([a.replayDir, b.replayDir].sort());
  });

  it('returns an empty list when Dota 2 is not installed (unhappy path)', async () => {
    const fakeLib = path.join(tmp, 'SteamNoDota');
    await writeFile(path.join(fakeLib, 'steamapps', 'common', 'some other game', 'x.txt'), '');
    expect(await findReplayDirs([fakeLib])).toEqual([]);
  });
});

describe('scanReplayDir', () => {
  it('lists only .dem files with their sizes (happy path)', async () => {
    const { replayDir } = await makeSteamLibraryWithReplays(path.join(tmp, 'Steam'), [
      { name: '8000000001.dem', bytes: 100_000 },
      { name: '8000000002.DEM', bytes: 200_000 }, // case-insensitive extension
    ]);
    await writeFile(path.join(replayDir, 'notes.txt'), 'keep me');
    await writeFile(path.join(replayDir, 'dem_backup.dem.bak'), 'keep me too');

    const scan = await scanReplayDir(replayDir);
    expect(scan.files).toHaveLength(2);
    expect(scan.totalBytes).toBe(300_000);
    expect(scan.files.every((f) => f.path.endsWith('.dem') || f.path.endsWith('.DEM'))).toBe(
      true,
    );
  });

  it('returns an empty scan for an empty replays folder (unhappy path)', async () => {
    const { replayDir } = await makeSteamLibraryWithReplays(path.join(tmp, 'Steam'), []);
    const scan = await scanReplayDir(replayDir);
    expect(scan.files).toEqual([]);
    expect(scan.totalBytes).toBe(0);
  });
});

describe('deleteReplays', () => {
  it('deletes every replay and reports freed bytes (happy path)', async () => {
    const { libraryDir, replayDir } = await makeSteamLibraryWithReplays(
      path.join(tmp, 'Steam'),
      [
        { name: 'a.dem', bytes: 1_000 },
        { name: 'b.dem', bytes: 2_000 },
      ],
    );
    await writeFile(path.join(replayDir, 'keep.txt'), 'do not touch');

    const scans = await scanAll(await findReplayDirs([libraryDir]));
    const summary = await deleteReplays(scans);

    expect(summary.filesDeleted).toBe(2);
    expect(summary.bytesFreed).toBe(3_000);
    expect(summary.failures).toEqual([]);
    expect(await fs.readdir(replayDir)).toEqual(['keep.txt']);
  });

  it('deletes nothing in dry-run mode but still reports the savings (happy path)', async () => {
    const { libraryDir, replayDir } = await makeSteamLibraryWithReplays(
      path.join(tmp, 'Steam'),
      [{ name: 'a.dem', bytes: 5_000 }],
    );
    const scans = await scanAll(await findReplayDirs([libraryDir]));
    const summary = await deleteReplays(scans, { dryRun: true });

    expect(summary.dryRun).toBe(true);
    expect(summary.filesDeleted).toBe(1);
    expect(summary.bytesFreed).toBe(5_000);
    expect(await fs.readdir(replayDir)).toEqual(['a.dem']);
  });

  it('handles an already-empty replays folder gracefully (unhappy path)', async () => {
    const { libraryDir } = await makeSteamLibraryWithReplays(path.join(tmp, 'Steam'), []);
    const scans = await scanAll(await findReplayDirs([libraryDir]));
    const summary = await deleteReplays(scans);
    expect(summary.filesDeleted).toBe(0);
    expect(summary.bytesFreed).toBe(0);
    expect(summary.failures).toEqual([]);
  });

  it('records failures instead of crashing when a file cannot be removed (unhappy path)', async () => {
    const { libraryDir, replayDir } = await makeSteamLibraryWithReplays(
      path.join(tmp, 'Steam'),
      [{ name: 'gone.dem', bytes: 1_000 }],
    );
    const scans = await scanAll(await findReplayDirs([libraryDir]));
    // Simulate a file that vanishes (or locks) between scan and delete.
    await fs.rm(path.join(replayDir, 'gone.dem'));

    const summary = await deleteReplays(scans);
    expect(summary.filesDeleted).toBe(0);
    expect(summary.failures).toHaveLength(1);
    expect(summary.failures[0]?.path).toContain('gone.dem');
  });
});

describe('formatBytes', () => {
  it('formats human-readable sizes (happy path)', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KiB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MiB');
    expect(formatBytes(3 * 1024 ** 3)).toBe('3.0 GiB');
  });
});
