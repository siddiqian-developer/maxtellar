#!/usr/bin/env bash
# Launches cli.mjs with stdin piped from the caller, auto-fixing the
# "libasound.so.2 missing, no sudo" issue this sandbox hits on first use.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIBDIR="$HERE/.libasound-extract/extracted/usr/lib/x86_64-linux-gnu"

if [ ! -f "$LIBDIR/libasound.so.2" ]; then
  mkdir -p "$HERE/.libasound-extract"
  cd "$HERE/.libasound-extract"
  apt-get download libasound2 >/dev/null 2>&1 || apt-get download libasound2t64 >/dev/null 2>&1
  dpkg-deb -x libasound2*.deb extracted
  cd "$HERE"
fi

export LD_LIBRARY_PATH="$LIBDIR${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
exec node "$HERE/cli.mjs"
