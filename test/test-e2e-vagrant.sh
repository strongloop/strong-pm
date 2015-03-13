#!/bin/sh

if ! which vagrant; then
  echo "ok # skip vagrant tests, vagrant not found"
  echo "no vagrant" >&2
  exit
fi

if test -n "$SKIP_VAGRANT"; then
  echo "ok # skip vagrant tests, disabled with SKIP_VAGRANT"
  echo "skip vagrant" >&2
  exit
fi

PKG=$(npm pack ..)

PKG_NAME=$PKG vagrant destroy --force
PKG_NAME=$PKG NODE_VER=0.10.36 vagrant up --provision

PM_URL=http://127.0.0.1:8702
APP_URL=http://127.0.0.1:8889
echo '# strong-pm running in VM'

# If this fails, bail out, otherwise we could do irreparable damage to the
# parent strong-pm repo if run from the wrong directory
cd app || exit 1
rm -rf .git .strong-pm
git clean -f -x -d .
git init .
echo "PORT=8888" > .env
git add .
git commit --author="sl-pm-test <nobody@strongloop.com>" -m "initial"
sl-build --install --commit
git push --quiet $PM_URL/repo HEAD

echo "# waiting for manager to deploy our app..."
sleep 5
echo "# polling...."
while ! curl -sI $APP_URL/this/is/a/test; do
  echo "# nothing yet, sleeping for 5s..."
  sleep 5
done

curl -s $APP_URL/env \
  | grep -F -e '"SL_PM_VAGRANT": "42"' \
  && echo 'ok # seed environment includes SL_PM_VAGRANT=42 via pm-install' \
  || echo 'not ok # failed to set SL_PM_VAGRANT=42 via pm-install'

curl -s $APP_URL/this/is/a/test \
  | grep -F -e '/this/is/a/test' \
  && echo 'ok # echo server responded' \
  || echo 'not ok # echo server failed to respond'

../../bin/sl-pmctl.js -C $PM_URL env-set foo=success bar=foo \
  | grep -F -e 'Environment updated' \
  && echo 'ok # pmctl env-set command ran without error' \
  || echo 'not ok # failed to run env-set foo=success'

sleep 5 # Long enough for app to restart

curl -s $APP_URL/env \
  | grep -F -e '"foo": "success"' \
  && echo 'ok # set foo=success via pmctl' \
  || echo 'not ok # failed to set foo=success via pmctl'

../../bin/sl-pmctl.js -C $PM_URL env-unset foo \
  | grep -F -e 'Environment updated' \
  && echo 'ok # pmctl env-set command ran without error' \
  || echo 'not ok # failed to run env-set foo=success'

sleep 5 # Long enough for app to restart

curl -s $APP_URL/env \
  | grep -F -e '"foo": "success"' \
  && echo 'not ok # failed to unset foo via pmctl' \
  || echo 'ok # unset foo via pmctl'
