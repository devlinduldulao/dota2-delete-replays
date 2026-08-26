#!/usr/bin/env node
import { promises as fs, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { Command } from 'commander';
import { defaultContext, UnsupportedPlatformError } from './platform.js';
import { findLibraryDirs, findSteamRoots, SteamNotFoundError } from './steam.js';
import { ui, VERSION } from './ui.js';
import {
  deleteReplays,
  findReplayDirs,
  formatBytes,
  REPLAY_DIR_SEGMENTS,
  scanAll,
  type ReplayDirScan,
} from './replays.js';

interface CliOptions {
  dryRun: boolean;
  yes: boolean;
  json: boolean;
  path?: string;
  olderThan?: number;
}

function printPlan(scans: ReplayDirScan[]): void {
  const totalFiles = scans.reduce((n, s) => n + s.files.length, 0);
  const totalBytes = scans.reduce((n, s) => n + s.totalBytes, 0);
  for (const scan of scans) {
    console.log(`\n📁 ${ui.dir(scan.dir)}`);
    console.log(
      `   ${ui.count(scan.files.length)} replay(s), ${ui.size(formatBytes(scan.totalBytes))}`,
    );
  }
  console.log(
    `\n${ui.total('Total:')} ${ui.count(totalFiles)} replay(s), ${ui.size(formatBytes(totalBytes))}`,
  );
}

async function confirm(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`${question} [y/N] `);
    return answer.trim().toLowerCase() === 'y' || answer.trim().toLowerCase() === 'yes';
  } finally {
    rl.close();
  }
}

/**
 * Accept either the replays dir itself or a Steam library root that contains one.
 */
async function resolvePathOverride(overridePath: string): Promise<string[]> {
  let stat;
  try {
    stat = await fs.stat(overridePath);
  } catch {
    throw new Error(`Path not found: "${overridePath}"`);
  }
  if (!stat.isDirectory()) {
    throw new Error(`Not a directory: "${overridePath}"`);
  }
  if (path.basename(overridePath).toLowerCase() === 'replays') {
    return [overridePath];
  }
  const nested = path.join(overridePath, ...REPLAY_DIR_SEGMENTS);
  try {
    if ((await fs.stat(nested)).isDirectory()) return [nested];
  } catch {
    /* fall through */
  }
  throw new Error(
    `"${overridePath}" is neither a Dota 2 replays folder nor a Steam library root containing one.`,
  );
}

export async function run(argv: string[]): Promise<number> {
  const program = new Command();
  program
    .name('dota2-delete-replays')
    .description(
      'Find and delete your Dota 2 match replays (.dem files) to free disk space.\n' +
        'Auto-detects Steam on Windows, macOS, and Linux, including secondary library drives.',
    )
    .version(VERSION)
    .option('-d, --dry-run', 'show what would be deleted without deleting anything', false)
    .option('-y, --yes', 'skip the confirmation prompt', false)
    .option('--json', 'print the result as JSON (implies --yes)', false)
    .option('-p, --path <dir>', 'use this replays folder instead of auto-detection')
    .option(
      '--older-than <days>',
      'only delete replays last modified more than this many days ago',
      (value: string) => Number(value),
    )
    .parse(argv);

  const opts = program.opts<CliOptions>();

  if (
    opts.olderThan !== undefined &&
    (!Number.isFinite(opts.olderThan) || opts.olderThan <= 0)
  ) {
    console.error(ui.error(`--older-than must be a positive number of days, got "${opts.olderThan}".`));
    return 1;
  }
  const scanOptions = opts.olderThan !== undefined ? { olderThanDays: opts.olderThan } : {};

  if (!opts.json) {
    console.log(ui.banner());
  }

  try {
    let replayDirs: string[];
    if (opts.path) {
      replayDirs = await resolvePathOverride(opts.path);
    } else {
      const steamRoots = await findSteamRoots(defaultContext());
      const libraryDirs = await findLibraryDirs(steamRoots);
      replayDirs = await findReplayDirs(libraryDirs);
    }

    if (replayDirs.length === 0) {
      const message =
        'No Dota 2 replay folders found. Either Dota 2 is not installed, ' +
        'or you have not downloaded any replays yet. 🎉 Nothing to clean.';
      if (opts.json) {
        console.log(JSON.stringify({ status: 'nothing-to-clean', replayDirs: [] }, null, 2));
      } else {
        console.log(ui.info(message));
      }
      return 0;
    }

    const scans = await scanAll(replayDirs, scanOptions);
    const totalFiles = scans.reduce((n, s) => n + s.files.length, 0);

    if (totalFiles === 0) {
      if (opts.json) {
        console.log(JSON.stringify({ status: 'nothing-to-clean', replayDirs }, null, 2));
      } else {
        console.log(
          ui.info(
            opts.olderThan !== undefined
              ? `No replays older than ${opts.olderThan} day(s). 🎉 Nothing to clean.`
              : 'Your replay folders are already empty. 🎉 Nothing to clean.',
          ),
        );
      }
      return 0;
    }

    if (!opts.json) {
      if (opts.olderThan !== undefined) {
        console.log(ui.dim(`Filter: only replays older than ${opts.olderThan} day(s).`));
      }
      printPlan(scans);
    }

    if (opts.dryRun) {
      const summary = await deleteReplays(scans, { dryRun: true });
      if (opts.json) {
        console.log(JSON.stringify({ status: 'dry-run', ...summary }, null, 2));
      } else {
        console.log(
          ui.warn('\n(dry run) No files were deleted. Re-run without --dry-run to clean up.'),
        );
      }
      return 0;
    }

    if (!opts.yes && !opts.json) {
      const ok = await confirm('\nDelete all of these replays? This cannot be undone.');
      if (!ok) {
        console.log(ui.info('Aborted. Your replays are safe. 🛡️'));
        return 0;
      }
    }

    const summary = await deleteReplays(scans);
    if (opts.json) {
      console.log(JSON.stringify({ status: 'done', ...summary }, null, 2));
    } else {
      console.log(
        ui.success(
          `\n✅ Deleted ${summary.filesDeleted} replay(s), freed ${formatBytes(summary.bytesFreed)}.`,
        ),
      );
      if (summary.failures.length > 0) {
        console.log(ui.warn(`⚠️  ${summary.failures.length} file(s) could not be deleted:`));
        for (const failure of summary.failures) {
          console.log(ui.dim(`   - ${failure.path}: ${failure.error}`));
        }
      }
    }
    return summary.failures.length > 0 ? 1 : 0;
  } catch (err) {
    if (err instanceof SteamNotFoundError || err instanceof UnsupportedPlatformError) {
      console.error(ui.error(err.message));
      return 1;
    }
    throw err;
  }
}

/**
 * Run only when executed directly (not when imported by tests).
 * Resolved through realpath so global installs work when npm links the bin
 * (argv[1] is then the symlink, not this file's real path).
 */
function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (isDirectRun()) {
  run(process.argv)
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    });
}
