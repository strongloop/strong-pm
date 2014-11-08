#!/bin/bash
source common.sh

# Setup
CMD="node ../bin/sl-pm-install.js"
TMP=`mktemp -d -t sl-svc-installXXXXXX`
echo "# using tmpdir: $TMP"

export SL_PM_INSTALL_IGNORE_PLATFORM=true

# should fail if given no arguments
assert_exit 1 $CMD

# asking for help is not a failure
assert_exit 0 $CMD --help

# dry-run should not fail
assert_exit 0 $CMD --dry-run --port 7777 --user `id -un`

# fails if attempting to use upstart systemd at the same time
assert_exit 1 $CMD --dry-run --port 7777 --user `id -un` --upstart 0.6 --systemd

# requires a valid port
assert_exit 1 $CMD --dry-run --user `id -un` --port ''
assert_exit 1 $CMD --dry-run --user `id -un` --port abc
assert_exit 1 $CMD --dry-run --user `id -un` --port 0

# should fail when given user doesn't actually exist
assert_exit 1 $CMD --dry-run --port 7777 --user definitely-does-not-exist

echo "FOO=bar BAR=foo" > $TMP/input.env
echo "MORE=less LESS=more" >> $TMP/input.env

# Should create an upstart job at the specified path
$CMD --port 7777 \
     --job-file $TMP/upstart.conf \
     --user `id -un` \
     --metrics statsd: \
     --set-env "$(cat $TMP/input.env)" \
     --base $TMP/deeply/nested/sl-pm 2>&1 \
|| fail "Failed to run install"

# Should match what was specified
assert_file $TMP/upstart.conf "--listen 7777"
assert_file $TMP/upstart.conf "--base $TMP/deeply/nested/sl-pm"

# Should actually point to strong-pm
assert_file $TMP/upstart.conf "$(node -p process.execPath) $(which sl-pm.js)"

# Should default to config relative to base
assert_file $TMP/upstart.conf "--config $TMP/deeply/nested/sl-pm/config"

# Should create base for us
assert_exit 0 test -d $TMP/deeply/nested/sl-pm

# Should put --metrics into STRONGLOOP_METRICS in seed environment
assert_file $TMP/deeply/nested/sl-pm/env.json '"STRONGLOOP_METRICS":"statsd:"'

# Should create initial environment file with FOO and BAR in it
assert_file $TMP/deeply/nested/sl-pm/env.json '"FOO":"bar"'
assert_file $TMP/deeply/nested/sl-pm/env.json '"BAR":"foo"'
assert_file $TMP/deeply/nested/sl-pm/env.json '"MORE":"less"'
assert_file $TMP/deeply/nested/sl-pm/env.json '"LESS":"more"'

unset SL_PM_INSTALL_IGNORE_PLATFORM
assert_report
