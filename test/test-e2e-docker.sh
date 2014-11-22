#!/bin/sh

set -e

if ! which docker > /dev/null; then
  echo "ok # skip docker tests, docker not found"
  exit
fi

if test -n "$SKIP_DOCKER"; then
  echo "ok # skip docker tests, disabled with SKIP_DOCKER"
  exit
fi

make container/strong-pm.tgz

docker build -t strong-pm:test container
docker run -i -t -d \
  --expose 7777 --expose 8888 -P \
  --env DEBUG=strong-pm:* \
  --cidfile=sl-pm.docker.cid \
  strong-pm:test --listen 7777

SL_PM=$(cat sl-pm.docker.cid)
rm sl-pm.docker.cid

echo "# strong-pm running in container: $SL_PM"
echo '# tailing container log to stderr...'
docker logs -t -f $SL_PM &
LOGGER=$!

# trap "docker stop $SL_PM; kill $LOGGER" EXIT

if which boot2docker > /dev/null; then
  LOCALHOST=$(boot2docker ip 2> /dev/null)
else
  LOCALHOST="127.0.0.1"
fi

# extract port from 'docker port' output: 0.0.0.0:1234
port() {
  echo $* | cut -d : -f 2
}

export STRONGLOOP_PM=http://$LOCALHOST:$(port $(docker port $SL_PM 7777/tcp))
export APP=http://$LOCALHOST:$(port $(docker port $SL_PM 8888/tcp))
echo "# strong-pm URL: $STRONGLOOP_PM"
echo "# app URL: $APP"

cd app
rm -rf .git .strong-pm
git clean -f -x -d .
git init .
echo "PORT=8888" > .env
git add .
git commit --author="sl-pm-test <nobody@strongloop.com>" -m "initial"
sl-build --install --commit
git push --quiet $STRONGLOOP_PM/repo HEAD

echo "# waiting for manager to deploy our app..."
sleep 5
echo "# polling...."
while ! curl -sI $APP/this/is/a/test; do
  echo "# nothing yet, sleeping for 5s..."
  sleep 5
done

curl -s $APP/this/is/a/test \
  | grep -F -e '/this/is/a/test' \
  && echo 'ok # echo server responded' \
  || echo 'not ok # echo server failed to respond'

../../bin/sl-pmctl.js -C $STRONGLOOP_PM env-set foo=success bar=foo \
  | grep -F -e 'Environment updated' \
  && echo 'ok # pmctl env-set command ran without error' \
  || echo 'not ok # failed to run env-set foo=success'

sleep 5 # Long enough for app to restart

curl -s $APP/env \
  | grep -F -e '"foo": "success"' \
  && echo 'ok # set foo=success via pmctl' \
  || echo 'not ok # failed to set foo=success via pmctl'

../../bin/sl-pmctl.js -C $STRONGLOOP_PM env-unset foo \
  | grep -F -e 'Environment updated' \
  && echo 'ok # pmctl env-set command ran without error' \
  || echo 'not ok # failed to run env-set foo=success'

sleep 5 # Long enough for app to restart

curl -s $APP/env \
  | grep -F -e '"foo": "success"' \
  && echo 'not ok # failed to unset foo via pmctl' \
  || echo 'ok # unset foo via pmctl'

docker stop $SL_PM
