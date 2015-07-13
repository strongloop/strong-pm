#!/bin/bash
cd $(dirname "${BASH_SOURCE[0]}")
source common.sh

# Setup
CMD="node ../bin/sl-pm-install.js"
TMP=`mktemp -d -t sl-svc-installXXXXXX`
CURRENT_USER=`id -un`
comment "using tmpdir: $TMP"

export SL_INSTALL_IGNORE_PLATFORM=true

# Should create an upstart job at the specified path
assert_exit 0 $CMD --port 7777 \
              --job-file $TMP/upstart.conf \
              --user $CURRENT_USER \
              --base $TMP/deeply/nested/sl-pm \
              --upstart 0.6

# Upstart 0.6 template uses logger because console log isn't supported
assert_file $TMP/upstart.conf "mkfifo /tmp/strong-pm"
assert_file $TMP/upstart.conf "logger -t strong-pm"
assert_file $TMP/upstart.conf "--driver direct"
assert_file $TMP/upstart.conf "$CURRENT_USER --"

unset SL_INSTALL_IGNORE_PLATFORM
