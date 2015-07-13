#!/bin/bash
cd $(dirname "${BASH_SOURCE[0]}")
source common.sh

# Setup
CMD="node ../bin/sl-pm-install.js"
TMP=`mktemp -d -t sl-svc-installXXXXXX`
CURRENT_USER=`id -un`
CURRENT_GROUP=`id -gn`
comment "using tmpdir: $TMP"

export SL_INSTALL_IGNORE_PLATFORM=true

# Should create a systemd service at the specified path
assert_exit 0 $CMD --port 7777 \
              --job-file $TMP/systemd.service \
              --user $CURRENT_USER \
              --base $TMP/deeply/nested/sl-pm \
              --systemd

# Simple lines that should be in the service file for this config
assert_file $TMP/systemd.service "ExecStart=$(node -p process.execPath)"
assert_file $TMP/systemd.service "WorkingDirectory=$HOME"
assert_file $TMP/systemd.service "Description=StrongLoop Process Manager"
assert_file $TMP/systemd.service "--driver direct"
assert_file $TMP/systemd.service "User=$CURRENT_USER"
assert_file $TMP/systemd.service "Group=$CURRENT_GROUP"

# Should create a systemd service at the specified path
assert_exit 0 $CMD --port 7777 \
              --job-file $TMP/systemd-with-docker.service \
              --user $CURRENT_USER \
              --base $TMP/deeply/nested/sl-pm \
              --driver docker \
              --systemd

# Simple lines that should be in the service file for this config
assert_file $TMP/systemd-with-docker.service "ExecStart=$(node -p process.execPath)"
assert_file $TMP/systemd-with-docker.service "WorkingDirectory=$HOME"
assert_file $TMP/systemd-with-docker.service "Description=StrongLoop Process Manager"
assert_file $TMP/systemd-with-docker.service "--driver docker"
assert_file $TMP/systemd-with-docker.service "User=$CURRENT_USER"
assert_file $TMP/systemd-with-docker.service "Group=docker"

unset SL_INSTALL_IGNORE_PLATFORM
