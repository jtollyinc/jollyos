# Releases — the one-click download

The goal: someone who has never opened a terminal lands on the Releases page,
downloads one file, unzips it, double-clicks a launcher, and JollyOS opens at
the first-run setup page. No Node, no npm, no Docker, nothing to look up.

So a release is **four ready-to-run zips**, one per system:

| Asset | For |
|---|---|
| `jollyos-<version>-windows-x64.zip` | Windows (x86-64) |
| `jollyos-<version>-macos-arm64.zip` | Macs with Apple silicon |
| `jollyos-<version>-macos-x64.zip` | Intel Macs |
| `jollyos-<version>-linux-x64.zip` | Linux (x86-64, glibc) |

## What is inside a zip

```
JollyOS/
  Start JollyOS.cmd      Windows launcher (plain cmd: no PowerShell policy to fight)
  Start JollyOS.command  macOS launcher (right-click → Open the first time)
  start-jollyos.sh       Linux launcher
  READ ME FIRST.txt      the three steps and the one warning for that OS
  LICENSE.txt
  app/                   the prebuilt Next.js standalone server + launcher.mjs
  runtime/               the official Node 22 build for this OS, nothing else
  data/                  created on first run: account, jobs, persona, server.log
```

Nothing is installed and nothing is compiled on the user's machine. The app is
already built (`output: "standalone"` in `next.config.mjs`), and the runtime is
the official build from `nodejs.org`, verified against `SHASUMS256.txt` at
package time. Deleting the folder removes JollyOS completely.

The launchers are three thin wrappers around one script,
`scripts/launcher/launch.mjs` (shipped as `app/launcher.mjs`), so the behaviour
cannot drift per OS:

- it starts the server with the **bundled** runtime (`process.execPath`), never
  a `node` on PATH;
- binds `127.0.0.1` and takes port 3000, or the next free port if 3000 is busy;
- waits for `/api/health`, prints the URL, opens the browser
  (`JOLLYOS_NO_BROWSER=1` skips that — the smoke test sets it);
- keeps `DATA_DIR` at `data/` next to the app, so copying that one folder into
  a newer version carries the account and the data over;
- stops the server when the window closes or Ctrl+C is pressed, and writes the
  server's own output to `data/server.log`.

`AUTH_SECRET` needs no handling: `lib/auth` generates one into
`DATA_DIR/auth-secret` (mode 600) on first use. There is no default secret and
no default login anywhere in the zip.

## Native modules

`sharp` (Next's image optimiser) is the only platform-specific dependency the
standalone output pulls in, and nothing in the app imports `next/image`, so it
is dropped from the payload. That is what makes one Linux box able to build all
four zips: the app payload is byte-identical across targets and only `runtime/`
differs. `scripts/package-release.sh` enforces both halves of that claim — it
refuses to build if `next/image` appears in the source, and again if any
`.node`, `.dll`, `.dylib` or `.so` survives in the payload.

## Building a zip

```bash
scripts/package-release.sh <target> [version] [--out DIR] [--no-build|--rebuild]
```

Any target builds from Linux (or macOS); it needs `curl`, `tar`, `zip`,
`unzip` and `sha256sum`. The version comes from the argument, else the pushed
tag (`GITHUB_REF_NAME`), else `package.json`. Node downloads are cached in
`~/.cache/jollyos-node`; `JOLLYOS_NODE_VERSION` overrides the pinned runtime.

```bash
npm ci && npm run build
for t in windows-x64 macos-arm64 macos-x64 linux-x64; do
  scripts/package-release.sh "$t" --out dist --no-build
done
```

To check a zip the way CI does — start it, assert the setup page answers 200,
stop it, assert the port goes quiet:

```bash
unzip -q dist/jollyos-0.1.0-linux-x64.zip -d /tmp/check
/tmp/check/JollyOS/runtime/bin/node scripts/smoke-release.mjs /tmp/check/JollyOS
```

## Cutting a release

1. Bump `version` in `package.json` and commit.
2. `git tag v0.1.0 && git push origin v0.1.0`.

`.github/workflows/release.yml` then builds the four zips once on Linux, smoke
tests each on its own runner (`windows-latest`, `macos-14` for Apple silicon,
`macos-13` for Intel, `ubuntu-latest`), and only then publishes the tag as the
latest release with all four zips and their `.sha256` files attached. Only the
publishing job gets `contents: write`.
