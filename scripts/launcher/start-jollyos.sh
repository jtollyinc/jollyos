#!/bin/bash
# start-jollyos.sh - run JollyOS (Linux). Double-click it in your file manager
# and choose "Run in Terminal", or run ./start-jollyos.sh in a terminal.
# Uses only the bundled Node runtime; nothing is installed on this machine.
cd -- "$(dirname -- "$0")" || exit 1

if [ ! -x "./runtime/bin/node" ] || [ ! -f "./app/launcher.mjs" ]; then
  echo "This folder is incomplete, or the launcher is not executable."
  echo "Unzip the download again (keeping every file together). If needed:"
  echo "  chmod +x start-jollyos.sh runtime/bin/node"
  exit 1
fi

echo "Starting JollyOS. A browser window will open in a moment."
echo "Leave this window open while you use JollyOS."
echo
exec "./runtime/bin/node" "./app/launcher.mjs"
