import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  findLibraryDirs,
  findSteamRoots,
  parseLibraryFoldersVdf,
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
    expect(roots).toEqual([path.join(home, '.steam', 'steam')]);
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
    expect(libs).toContain(path.normalize(root));
    expect(libs).toContain(path.normalize(second));
    // The non-existent "ghost" library is filtered out.
    expect(libs.some((l) => l.includes('ghost'))).toBe(false);
  });

  it('works when libraryfolders.vdf is missing (unhappy path)', async () => {
    const root = path.join(tmp, 'SteamNoVdf');
    await writeFile(path.join(root, 'steamapps', 'keep.txt'), '');
    const libs = await findLibraryDirs([root]);
    expect(libs).toEqual([path.normalize(root)]);
  });
});
