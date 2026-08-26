# dota2-delete-replays

A tiny cross-platform CLI that finds and deletes your **Dota 2 match replays** (`.dem` files) so they stop eating your disk space. Works on **Windows**, **macOS**, and **Linux** — it detects your OS, finds your Steam installation (including secondary library drives), and cleans up only replay files. Nothing else in your Steam library is ever touched.

## Install

```bash
npm install -g dota2-delete-replays
```

Requires Node.js 20 or newer.

## Usage

```bash
# See what would be deleted first (recommended)
dota2-delete-replays --dry-run

# Delete all replays (asks for confirmation)
dota2-delete-replays

# Delete without the confirmation prompt
dota2-delete-replays --yes

# Machine-readable output for scripts (implies --yes)
dota2-delete-replays --json

# Point at a custom location (a replays folder or a Steam library root)
dota2-delete-replays --path "D:\SteamLibrary"
```

## How it finds your replays

Dota 2 stores downloaded replays at:

```
<steam-library>/steamapps/common/dota 2 beta/game/dota/replays
```

The CLI checks the default Steam install location for your OS:

| OS      | Default Steam locations checked                                                                 |
| ------- | ----------------------------------------------------------------------------------------------- |
| Windows | `%ProgramFiles(x86)%\Steam`, `%ProgramFiles%\Steam`, `%LocalAppData%\Steam`                        |
| macOS   | `~/Library/Application Support/Steam`                                                            |
| Linux   | `~/.steam/steam`, `~/.local/share/Steam`, Flatpak (`~/.var/app/com.valvesoftware.Steam/...`), Snap |

It also parses `steamapps/libraryfolders.vdf`, so replays on **secondary drives** (e.g. `D:\SteamLibrary`) are found too.

Only files ending in `.dem` inside the replays folder are deleted. Match history, screenshots, config, and everything else stays put.

## Safety

- `--dry-run` shows exactly what will be removed before you commit.
- Interactive confirmation prompt unless you pass `--yes` or `--json`.
- Deleting a replay only removes your **local downloaded copy** — replays can be re-downloaded from the Dota 2 client while Valve still has them.

## Development

```bash
npm install
npm run build       # bundle with tsup -> dist/cli.js
npm test            # vitest (happy + unhappy paths)
npm run typecheck   # TypeScript 7 strict mode
```

## Release

CI runs on Ubuntu, macOS, and Windows. Pushing a `v*` tag publishes to npm
via GitHub Actions (requires an `NPM_TOKEN` repository secret).

## License

MIT
