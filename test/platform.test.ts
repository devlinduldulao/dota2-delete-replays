import { describe, expect, it } from 'vitest';
import {
  candidateSteamRoots,
  UnsupportedPlatformError,
  type PlatformContext,
} from '../src/platform.js';

function ctx(partial: Partial<PlatformContext>): PlatformContext {
  return { platform: 'linux', homeDir: '/home/gamer', env: {}, ...partial };
}

describe('candidateSteamRoots', () => {
  it('returns the macOS Steam location under the user Library (happy path)', () => {
    const roots = candidateSteamRoots(
      ctx({ platform: 'darwin', homeDir: '/Users/gamer' }),
    );
    expect(roots).toEqual(['/Users/gamer/Library/Application Support/Steam']);
  });

  it('returns native, Flatpak, and Snap locations on Linux (happy path)', () => {
    const roots = candidateSteamRoots(ctx({ platform: 'linux' }));
    expect(roots).toContain('/home/gamer/.steam/steam');
    expect(roots).toContain('/home/gamer/.local/share/Steam');
    expect(roots).toContain(
      '/home/gamer/.var/app/com.valvesoftware.Steam/.local/share/Steam',
    );
    expect(roots).toContain('/home/gamer/snap/steam/common/.local/share/Steam');
  });

  it('uses Program Files environment variables on Windows (happy path)', () => {
    const roots = candidateSteamRoots(
      ctx({
        platform: 'win32',
        homeDir: 'C:\\Users\\gamer',
        env: {
          'ProgramFiles(x86)': 'C:\\Program Files (x86)',
          ProgramFiles: 'C:\\Program Files',
          LOCALAPPDATA: 'C:\\Users\\gamer\\AppData\\Local',
        },
      }),
    );
    expect(roots).toContain('C:\\Program Files (x86)\\Steam');
    expect(roots).toContain('C:\\Program Files\\Steam');
    expect(roots).toContain('C:\\Users\\gamer\\AppData\\Local\\Steam');
  });

  it('falls back to sensible Windows defaults when env vars are missing', () => {
    const roots = candidateSteamRoots(
      ctx({ platform: 'win32', homeDir: 'C:\\Users\\gamer', env: {} }),
    );
    expect(roots).toContain('C:\\Program Files (x86)\\Steam');
    expect(roots).toContain('C:\\Program Files\\Steam');
  });

  it('throws a clear error on unsupported operating systems (unhappy path)', () => {
    expect(() => candidateSteamRoots(ctx({ platform: 'freebsd' }))).toThrow(
      UnsupportedPlatformError,
    );
    expect(() => candidateSteamRoots(ctx({ platform: 'freebsd' }))).toThrow(/freebsd/);
  });
});
