import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  findLibraryDirs,
  findSteamRoots,
  parseLibraryFoldersVdf,
  parseRegQueryInstallPath,
  SteamNotFoundError,
} from '../src/steam.js';
import { mkTmpDir, writeFile } from './helpers.js';

let tmp: string;

beforeEach(async () => {
  tmp = await mkTmpDir();
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('parseLibraryFoldersVdf', () => {
  it('extracts every library path (happy path)', () => {
    const vdf = `"libraryfolders"
{
	"0"
	{
		"path"		"C:\\\\Program Files (x86)\\\\Steam"
		"label"		""
	}
	"1"
	{
		"path"		"D:\\\\SteamLibrary"
		"label"		""
	}
}
`;
    expect(parseLibraryFoldersVdf(vdf)).toEqual([
      'C:\\Program Files (x86)\\Steam',
      'D:\\SteamLibrary',
    ]);
  });

  it('returns an empty array for content without path entries (unhappy path)', () => {
    expect(parseLibraryFoldersVdf('"libraryfolders"\n{\n}\n')).toEqual([]);
    expect(parseLibraryFoldersVdf('not even vdf')).toEqual([]);
  });
});

describe('findSteamRoots', () => {
  it('returns existing roots only (happy path)', async () => {
    const home = path.join(tmp, 'home');
    await writeFile(path.join(home, '.steam', 'steam', 'steamapps', 'keep.txt'), '');
    const roots = await findSteamRoots({ platform: 'linux', homeDir: home, env: {} });
    expect(roots).toEqual([await fs.realpath(path.join(home, '.steam', 'steam'))]);
  });

  it('throws SteamNotFoundError with searched paths when Steam is absent (unhappy path)', async () => {
    const home = path.join(tmp, 'empty-home');
    await fs.mkdir(home, { recursive: true });
    await expect(
      findSteamRoots({ platform: 'linux', homeDir: home, env: {} }),
    ).rejects.toThrow(SteamNotFoundError);
    await expect(
      findSteamRoots({ platform: 'linux', homeDir: home, env: {} }),
    ).rejects.toThrow(/\.steam\/steam/);
  });
});

describe('parseRegQueryInstallPath', () => {
  it('extracts the Steam InstallPath from reg query output (happy path)', () => {
    const output = `
HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\Valve\\Steam
    InstallPath    REG_SZ    C:\\Program Files (x86)\\Steam
`;
    expect(parseRegQueryInstallPath(output)).toBe('C:\\Program Files (x86)\\Steam');
  });

  it('handles install paths containing spaces (happy path)', () => {
    const output = '    InstallPath    REG_SZ    D:\\My Games\\Steam\r\n';
    expect(parseRegQueryInstallPath(output)).toBe('D:\\My Games\\Steam');
  });

  it('returns null when the value is missing (unhappy path)', () => {
    expect(parseRegQueryInstallPath('ERROR: The system was unable to find the specified registry key or value.')).toBeNull();
    expect(parseRegQueryInstallPath('')).toBeNull();
  });
});

describe('findLibraryDirs', () => {
  it('includes secondary libraries from libraryfolders.vdf (happy path)', async () => {
    const root = path.join(tmp, 'Steam');
    const second = path.join(tmp, 'SecondDrive', 'SteamLibrary');
    await writeFile(path.join(root, 'steamapps', 'keep.txt'), '');
    await writeFile(path.join(second, 'steamapps', 'keep.txt'), '');
    const vdf = `"libraryfolders"
{
	"0"
	{
		"path"		"${root.replace(/\\/g, '\\\\')}"
	}
	"1"
	{
		"path"		"${second.replace(/\\/g, '\\\\')}"
	}
	"2"
	{
		"path"		"${path.join(tmp, 'ghost').replace(/\\/g, '\\\\')}"
	}
}
`;
    await writeFile(path.join(root, 'steamapps', 'libraryfolders.vdf'), vdf);

    const libs = await findLibraryDirs([root]);
    expect(libs).toContain(await fs.realpath(root));
    expect(libs).toContain(await fs.realpath(second));
    // The non-existent "ghost" library is filtered out.
    expect(libs.some((l) => l.includes('ghost'))).toBe(false);
  });

  it('works when libraryfolders.vdf is missing (unhappy path)', async () => {
    const root = path.join(tmp, 'SteamNoVdf');
    await writeFile(path.join(root, 'steamapps', 'keep.txt'), '');
    const libs = await findLibraryDirs([root]);
    expect(libs).toEqual([await fs.realpath(root)]);
  });

  it('de-duplicates the same library reported with different casing (regression: duplicate scan on Windows)', async () => {
    const root = path.join(tmp, 'Steam');
    await writeFile(path.join(root, 'steamapps', 'keep.txt'), '');
    // Windows reports the same folder with different casing via env vars vs
    // the registry; on case-insensitive filesystems both stat successfully.
    const libs = await findLibraryDirs([root, root.toLowerCase(), root.toUpperCase()], 'win32');
    expect(libs).toHaveLength(1);
  });

  it('de-duplicates a library listed again in its own libraryfolders.vdf (regression)', async () => {
    const root = path.join(tmp, 'SteamVdfDup');
    await writeFile(path.join(root, 'steamapps', 'keep.txt'), '');
    const vdf = `"libraryfolders"
{
	"0"
	{
		"path"		"${root.replace(/\\/g, '\\\\')}"
	}
}
`;
    await writeFile(path.join(root, 'steamapps', 'libraryfolders.vdf'), vdf);
    const libs = await findLibraryDirs([root]);
    expect(libs).toHaveLength(1);
  });

  it('de-duplicates a Steam root reached through a symlink (Linux ~/.steam/steam scenario)', async () => {
    const real = path.join(tmp, 'RealSteam');
    await writeFile(path.join(real, 'steamapps', 'keep.txt'), '');
    const link = path.join(tmp, 'SteamLink');
    try {
      await fs.symlink(real, link, process.platform === 'win32' ? 'junction' : 'dir');
    } catch {
      // Filesystem or privileges do not allow symlinks here; nothing to test.
      return;
    }
    const libs = await findLibraryDirs([real, link]);
    expect(libs).toHaveLength(1);
    expect(libs[0]).toBe(await fs.realpath(real));
  });
});
