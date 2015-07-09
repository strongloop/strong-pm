#!/bin/bash
cd $(dirname "${BASH_SOURCE[0]}")
source common.sh

if ! which vagrant; then
  skip "vagrant not found"
  exit
fi

if test -n "$SKIP_VAGRANT"; then
  skip "disabled with SKIP_VAGRANT"
  exit
fi

PKG=strong-pm.tgz
NODE_NAME=$(basename $(node -p process.execPath))
NODE_VER=$(node --version)
make $PKG \
 && ok "prepared strong-pm for testing in Vagrant" \
 || fail "could not prepare strong-pm for testing"

comment "testing with $NODE_NAME-$NODE_VER"
PKG_NAME=$PKG vagrant destroy --force
comment "creating fresh Vagrant VM, this may take a while"
PKG_NAME=$PKG NODE_NAME=$NODE_NAME NODE_VER=$NODE_VER vagrant up --provision \
  && ok "vagrant VM provisioned" \
  || fail "vagrant VM not provisioned"

vagrant ssh -- id strong-pm | grep docker \
  && ok 'strong-pm user added to docker group' \
  || fail 'strong-pm user not added to docker group'

PM_URL=http://127.0.0.1:8702
APP_URL=http://127.0.0.1:8889
comment 'strong-pm running in VM'

# If this fails, bail out, otherwise we could do irreparable damage to the
# parent strong-pm repo if run from the wrong directory
cd app || bailout 'could not cd into test app'
rm -rf .git .strong-pm
git clean -f -x -d .
git init .
git add .
git commit --author="sl-pm-test <nobody@strongloop.com>" -m "initial"
sl-build --install --commit

comment "waiting for manager to be accessible..."
wait_until_available $PM_URL \
  && ok "PM accessible" \
  || bailout "PM not accessible, bailing out"

comment "creating Service 1 to we can deploy to it"
curl -s -X POST -d'{"name":"default"}' \
        -H "Content-Type: application/json" \
        $PM_URL/api/Services \
  && ok 'created service 1' \
  || fail 'could not create service 1'

git push --quiet --force $PM_URL/api/Services/1/deploy HEAD \
  && ok 'git push app works' \
  || fail 'could not git push app'

comment "waiting for manager to deploy our app..."
sleep 50 # dockerizing apps takes a little while
wait_until_available $APP_URL/this/is/a/test \
  && ok "App accessible" \
  || bailout "App not accessible, bailing out ($APP_URL)"

curl -s $APP_URL/env \
  | grep -F -e '"SL_PM_VAGRANT": "42"' \
  && ok 'seed environment includes SL_PM_VAGRANT=42 via pm-install' \
  || fail 'failed to set SL_PM_VAGRANT=42 via pm-install'

curl -s $APP_URL/this/is/a/test \
  | grep -F -e '/this/is/a/test' \
  && ok 'echo server responded' \
  || fail 'echo server failed to respond'

../../bin/sl-pmctl.js -C $PM_URL env-set 1 foo=success bar=foo \
  | grep -F -e 'environment updated' \
  && ok 'pmctl env-set command ran without error' \
  || fail 'failed to run env-set foo=success'

sleep 5 # Long enough for app to restart

curl -s $APP_URL/env \
  | grep -F -e '"foo": "success"' \
  && ok 'set foo=success via pmctl' \
  || fail 'failed to set foo=success via pmctl'

../../bin/sl-pmctl.js -C $PM_URL env-unset 1 foo \
  | grep -F -e 'environment updated' \
  && ok 'pmctl env-unset command ran without error' \
  || fail 'failed to run env-unset foo'

sleep 5 # Long enough for app to restart

curl -s $APP_URL/env \
  | grep -F -e '"foo": ' \
  && fail 'failed to unset foo via pmctl' \
  || ok 'unset foo via pmctl'

PKG_NAME=$PKG NODE_NAME=$NODE_NAME NODE_VER=$NODE_VER vagrant halt
