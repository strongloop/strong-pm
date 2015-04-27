#!/bin/sh

set -e

if ! docker info > /dev/null; then
  echo "ok # skip docker tests, docker not installed or not running"
  exit
fi

if test -n "$SKIP_DOCKER"; then
  echo "ok # skip docker tests, disabled with SKIP_DOCKER"
  exit
fi

# extract port from 'docker port' output: 0.0.0.0:1234
port() {
  echo $* | cut -d : -f 2
}

# run container and update variables
# $1: image to run
docker_run() {
  rm -f sl-pm.docker.cid
  docker run -i -t -d \
    --expose 8701 --expose 3000-3005 -P \
    --env DEBUG=strong-pm:* \
    --env STRONGLOOP_CLUSTER=1 \
    --env STRONG_PM_LOCKED=$STRONG_PM_LOCKED \
    --env STRONGLOOP_PM_HTTP_AUTH=$STRONGLOOP_PM_HTTP_AUTH \
    --cidfile=sl-pm.docker.cid \
    $1 --listen 8701

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
  export LOCALHOST_NOAUTH="$LOCALHOST"

  if test -n "$STRONGLOOP_PM_HTTP_AUTH"; then
    LOCALHOST="$STRONGLOOP_PM_HTTP_AUTH@$LOCALHOST"
  fi

  export STRONGLOOP_PM=http://$LOCALHOST:$(port $(docker port $SL_PM 8701/tcp))
  export STRONGLOOP_PM_NOAUTH=http://$LOCALHOST_NOAUTH:$(port $(docker port $SL_PM 8701/tcp))
  export APP1=http://$LOCALHOST:$(port $(docker port $SL_PM 3001/tcp))
  export APP2=http://$LOCALHOST:$(port $(docker port $SL_PM 3002/tcp))
  export APP1_GIT=$STRONGLOOP_PM/api/Services/1/deploy
  export APP2_GIT=$STRONGLOOP_PM/api/Services/2/deploy
  echo "# strong-pm URL: $STRONGLOOP_PM"
  echo "# app URL: $APP"
}

make npm_config_registry=${npm_config_registry:-$(npm config get registry)} container/strong-pm.tgz container/Dockerfile

docker build -t strong-pm:test container
docker_run strong-pm:test

# If this fails, bail out, otherwise we could do irreparable damage to the
# parent strong-pm repo if run from the wrong directory
cd app || exit 1
rm -rf .git .strong-pm
git clean -f -x -d .
git init .
git add .
git commit --author="sl-pm-test <nobody@strongloop.com>" -m "initial"
sl-build --install --commit
echo "# creating Service 1 to we can deploy to it"
curl -s -X POST -d'{"name":"default"}' -H "Content-Type: application/json" $STRONGLOOP_PM/api/Services
git push --quiet $APP1_GIT HEAD

echo "# waiting for manager to deploy our app..."
sleep 5
echo "# polling...."
while ! curl -sI $APP1/this/is/a/test; do
  echo "# nothing yet, sleeping for 5s..."
  sleep 5
done

curl -s $APP1/this/is/a/test \
  | grep -F -e '/this/is/a/test' \
  && echo 'ok # echo server responded' \
  || echo 'not ok # echo server failed to respond'

../../bin/sl-pmctl.js -C $STRONGLOOP_PM env-set 1 foo=success bar=foo \
  | grep -F -e 'environment updated' \
  && echo 'ok # pmctl env-set command ran without error' \
  || echo 'not ok # failed to run env-set foo=success'

sleep 5 # Long enough for app to restart

curl -s $APP1/env \
  | grep -F -e '"foo": "success"' \
  && echo 'ok # set foo=success via pmctl' \
  || echo 'not ok # failed to set foo=success via pmctl'

../../bin/sl-pmctl.js -C $STRONGLOOP_PM env-unset 1 foo \
  | grep -F -e 'environment updated' \
  && echo 'ok # pmctl env-set command ran without error' \
  || echo 'not ok # failed to run env-set foo=success'

sleep 5 # Long enough for app to restart

curl -s $APP1/env \
  | grep -F -e '"foo": "success"' \
  && echo 'not ok # failed to unset foo via pmctl' \
  || echo 'ok # unset foo via pmctl'

# make new image of strong-pm that includes a deployed app
docker commit $SL_PM strong-pm:test-deployed
docker stop $SL_PM

# run strong-pm instance that already has an app deployed to it
STRONG_PM_LOCKED=1 docker_run strong-pm:test-deployed

echo "# waiting for manager to deploy our app..."
sleep 5
echo "# polling...."
while ! curl -sI $APP1/this/is/a/test; do
  echo "# nothing yet, sleeping for 5s..."
  sleep 5
done

git push --quiet $APP1_GIT HEAD \
  && echo 'not ok # git push should be rejected' \
  || echo 'ok # git push rejected'

docker stop $SL_PM

# run strong-pm instance that already has an app deployed to it
STRONGLOOP_PM_HTTP_AUTH=user:pass docker_run strong-pm:test-deployed

echo "# waiting for manager to deploy our app..."
sleep 5
echo "# polling...."
while ! curl -sI $APP1/this/is/a/test; do
  echo "# nothing yet, sleeping for 5s..."
  sleep 5
done

../../bin/sl-pmctl.js -C $STRONGLOOP_PM status 1 \
  && echo 'ok # pmctl status command ran with auth' \
  || echo 'not ok # failed to run status with auth'


../../bin/sl-pmctl.js -C $STRONGLOOP_PM_NOAUTH status 1 \
  && echo 'not ok # pmctl status should fail without auth' \
  || echo 'ok # pmctl failed to run status without auth'

docker stop $SL_PM
