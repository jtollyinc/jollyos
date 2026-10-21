#!/bin/bash
# Start JollyOS.command - double-click this (macOS). The first time, right-click
# it and choose Open, so macOS lets an app it did not check for you run.
# Uses only the bundled Node runtime; nothing is installed on this Mac.
cd -- "$(dirname -- "$0")" || exit 1

# A ZIP from the internet arrives quarantined, which makes macOS question every
# file inside it. Clearing the flag on this folder only (no admin rights, no
# system change) is what makes the bundled runtime start without a prompt.
xattr -dr com.apple.quarantine . 2>/dev/null || true

# Some unzip tools drop the "may be executed" bit. Put it back rather than
# making a first-time user work out why nothing happens.
[ -x "./runtime/bin/node" ] || chmod +x "./runtime/bin/node" 2>/dev/null || true

if [ ! -x "./runtime/bin/node" ] || [ ! -f "./app/launcher.mjs" ]; then
  echo "This folder is incomplete. Unzip the download again and keep every file together."
  read -r -p "Press Return to close this window. " _
  exit 1
fi

echo "Starting JollyOS. A browser window will open in a moment."
echo "Leave this window open while you use JollyOS."
echo
"./runtime/bin/node" "./app/launcher.mjs"
code=$?
if [ "$code" -ne 0 ]; then
  echo
  echo "JollyOS stopped with an error (code $code). Details are in: data/server.log"
  read -r -p "Press Return to close this window. " _
fi
exit "$code"
