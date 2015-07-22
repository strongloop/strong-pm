#!/bin/bash
set -e

cd $(dirname "${BASH_SOURCE[0]}")
source common.sh

if ! docker info > /dev/null; then
  skip "docker not installed or not running"
  exit
fi

if test -n "$SKIP_DOCKER"; then
  skip "disabled with SKIP_DOCKER"
  exit
fi

# extract port from 'docker port' output: 0.0.0.0:1234
function port() {
  echo $* | cut -d : -f 2
}

function cleanup_docker() {
  if test -z $SL_PM; then
    echo nothing to clean up
  else
    docker stop -t 1 $SL_PM
  fi
}

# run container and update variables
# $1: image to run
function docker_run() {
  rm -f sl-pm.docker.cid
  docker run -i -t -d \
    --expose 8701 --expose 3000-3005 -P \
    --env DEBUG=strong-pm:* \
    --env STRONGLOOP_CLUSTER=1 \
    --env STRONG_PM_LOCKED=$STRONG_PM_LOCKED \
    --env STRONGLOOP_PM_HTTP_AUTH=$STRONGLOOP_PM_HTTP_AUTH \
    --cidfile=sl-pm.docker.cid \
    $1 --listen 8701
  ok 'docker run: pm container started'

  SL_PM=$(cat sl-pm.docker.cid)
  rm sl-pm.docker.cid
  trap cleanup_docker EXIT

  comment "strong-pm running in container: $SL_PM"
  comment 'tailing container log to stderr...'
  docker logs -t -f $SL_PM &
  # docker log will die when the container it is connected to dies

  if test -n "$DOCKER_HOST"; then
    LOCALHOST=${DOCKER_HOST##*/}
    LOCALHOST=${LOCALHOST%%:*}
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
  comment "strong-pm URL: $STRONGLOOP_PM"
  comment "app1 URL: $APP1"
  comment "app2 URL: $APP2"
}

make npm_config_registry=${npm_config_registry:-$(npm config get registry)} container/strong-pm.tgz container/Dockerfile
ok "prepared Dockerfile for building test image"

docker build -t strong-pm:test container \
  && ok 'docker build: pm container built'
docker_run strong-pm:test

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
wait_until_available $STRONGLOOP_PM \
  && ok "PM accessible" \
  || bailout "PM not accessible, bailing out"

comment "creating Service 1 to we can deploy to it"
curl -s -X POST -d'{"name":"default"}' \
        -H "Content-Type: application/json" \
        $STRONGLOOP_PM/api/Services \
  && ok 'created service 1' \
  || fail 'could not create service 1'

git push --quiet $APP1_GIT HEAD \
  && ok 'git pushed app' \
  || fail 'could not git push app as service 1'

comment "waiting for manager to deploy our app..."
sleep 5
wait_until_available $APP1/this/is/a/test \
  && ok "PM accessible" \
  || bailout "PM not accessible, bailing out"

curl -s $APP1/this/is/a/test \
  | grep -F -e '/this/is/a/test' \
  && ok 'echo server responded' \
  || fail 'echo server failed to respond'

../../bin/sl-pmctl.js -C $STRONGLOOP_PM env-set 1 foo=success bar=foo \
  | grep -F -e 'environment updated' \
  && ok 'pmctl env-set command ran without error' \
  || fail 'failed to run env-set foo=success'

sleep 5 # Long enough for app to restart

curl -s $APP1/env \
  | grep -F -e '"foo": "success"' \
  && ok 'set foo=success via pmctl' \
  || fail 'failed to set foo=success via pmctl'

../../bin/sl-pmctl.js -C $STRONGLOOP_PM env-unset 1 foo \
  | grep -F -e 'environment updated' \
  && ok 'pmctl env-set command ran without error' \
  || fail 'failed to run env-set foo=success'

sleep 5 # Long enough for app to restart

curl -s $APP1/env \
  | grep -F -e '"foo": "success"' \
  && fail 'failed to unset foo via pmctl' \
  || ok 'unset foo via pmctl'

# make new image of strong-pm that includes a deployed app
docker commit $SL_PM strong-pm:test-deployed
docker stop $SL_PM

# run strong-pm instance that already has an app deployed to it
STRONG_PM_LOCKED=1 docker_run strong-pm:test-deployed

comment "waiting for manager to deploy our app..."
wait_until_available $APP1/this/is/a/test \
  && ok "APP1 accessible" \
  || bailout "APP1 not accessible, bailing out"

git push --quiet $APP1_GIT HEAD \
  && fail 'git push should be rejected' \
  || ok 'git push rejected'

docker stop $SL_PM

# run strong-pm instance that already has an app deployed to it
STRONGLOOP_PM_HTTP_AUTH=user:pass docker_run strong-pm:test-deployed

comment "waiting for manager to deploy our app..."
wait_until_available $APP1/this/is/a/test \
  && ok "APP1 accessible" \
  || bailout "APP1 not accessible, bailing out"

../../bin/sl-pmctl.js -C $STRONGLOOP_PM status 1 \
  && ok 'pmctl status command ran with auth' \
  || fail 'failed to run status with auth'


../../bin/sl-pmctl.js -C $STRONGLOOP_PM_NOAUTH status 1 \
  && fail 'pmctl status should fail without auth' \
  || ok 'pmctl failed to run status without auth'

docker stop $SL_PM

assert_report
