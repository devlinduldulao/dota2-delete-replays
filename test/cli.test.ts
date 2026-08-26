import { describe, expect, it } from 'vitest';
import { run } from '../src/cli.js';

describe('cli argument handling', () => {
  it('reports an error for a --path that does not exist (unhappy path)', async () => {
    await expect(run(['node', 'dota2-delete-replays', '--path', '/no/such/dir'])).rejects.toThrow(
      /Path not found/,
    );
  });
});
