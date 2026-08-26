import { describe, expect, it } from 'vitest';
import { run } from '../src/cli.js';
import { makeSteamLibraryWithReplays, mkTmpDir } from './helpers.js';
import { promises as fs } from 'node:fs';

describe('cli argument handling', () => {
  it('reports an error for a --path that does not exist (unhappy path)', async () => {
    await expect(run(['node', 'dota2-delete-replays', '--path', '/no/such/dir'])).rejects.toThrow(
      /Path not found/,
    );
  });

  it('rejects a non-numeric --older-than value (unhappy path)', async () => {
    const code = await run(['node', 'dota2-delete-replays', '--older-than', 'abc']);
    expect(code).toBe(1);
  });

  it('rejects a negative --older-than value (unhappy path)', async () => {
    const code = await run(['node', 'dota2-delete-replays', '--older-than=-5']);
    expect(code).toBe(1);
  });

  it('cleans a custom replays folder via --path and --json (happy path)', async () => {
    const tmp = await mkTmpDir();
    try {
      const { libraryDir } = await makeSteamLibraryWithReplays(tmp, [
        { name: 'match.dem', bytes: 2_048 },
      ]);
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (...args: unknown[]) => logs.push(args.join(' '));
      try {
        const code = await run([
          'node',
          'dota2-delete-replays',
          '--path',
          libraryDir,
          '--json',
        ]);
        expect(code).toBe(0);
      } finally {
        console.log = originalLog;
      }
      const result = JSON.parse(logs.join('\n')) as {
        status: string;
        filesDeleted: number;
        bytesFreed: number;
      };
      expect(result.status).toBe('done');
      expect(result.filesDeleted).toBe(1);
      expect(result.bytesFreed).toBe(2_048);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});
