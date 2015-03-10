#!/bin/bash
source common.sh

# Setup
CMD="node ../bin/sl-pm-install.js"
TMP=`mktemp -d -t sl-svc-installXXXXXX`
echo "# using tmpdir: $TMP"

export SL_PM_INSTALL_IGNORE_PLATFORM=true

# Should create a systemd service at the specified path
assert_exit 0 $CMD --port 7777 \
              --job-file $TMP/systemd.service \
              --user `id -un` \
              --base $TMP/deeply/nested/sl-pm \
              --systemd

# Simple lines that should be in the service file for this config
assert_file $TMP/systemd.service "ExecStart=$(node -p process.execPath)"
assert_file $TMP/systemd.service "WorkingDirectory=$HOME"
assert_file $TMP/systemd.service "Description=StrongLoop Process Manager"

unset SL_PM_INSTALL_IGNORE_PLATFORM
assert_report
