#!/bin/bash
source common.sh

# Setup
CMD="node ../bin/sl-pm.js"
TMP=`mktemp -d -t sl-svc-installXXXXXX`
echo "# using tmpdir: $TMP"
CONF="$TMP/sl-pm-config.ini"

# config file has not been created yet
assert_exit 1 test -f $CONF

# run sl-pm, specifying the non-existant config file
# (cheap imitation of timeout from Linux coreutils)
( $CMD --listen 0 --config $CONF >&2 ) & sleep 5; kill -9 $!

# config file should now exist
assert_file $CONF

# .. and should contain the default config
assert_file $CONF "start[]=sl-run --cluster=CPU"

assert_report
