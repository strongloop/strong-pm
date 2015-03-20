#!/bin/sh

SYSTEMCTL=/usr/bin/systemctl
INITCTL=/sbin/initctl
DOCKER=$(which docker)
INIT=none
STOP=

IMAGE=strongloop/strong-pm
CONTAINER=strong-pm-container
CONTAINER_ENVS=

die() {
    echo $*
    exit 1
}

require_docker() {
  if test -z "$DOCKER" || test ! -x $DOCKER; then
    die "Unable to find docker. Is it installed?"
  fi
  $DOCKER info > /dev/null || service docker start
  $DOCKER info > /dev/null || die "Unable to run docker commands."
}

reject_remote_docker() {
  if test -n "$DOCKER_HOST"; then
      die "Remote docker not supported"
  fi
}

detect_init() {
  if test -x $SYSTEMCTL; then
    STOP="$SYSTEMCTL stop"
    INIT=systemd
  elif test -x $INITCTL; then
    STOP="$INITCTL stop"
    INIT=upstart
  else
    die "Sorry, only Upstart and systemd are supported so far"
  fi
}

install_systemd_service() {
  echo "Installing systemd service: $CONTAINER"
  cat > /etc/systemd/system/$CONTAINER.service <<EOF
[Unit]
Description=StrongLoop Process Manager Container
Author=StrongLoop <callback@strongloop.com>
After=docker.service

[Service]
Restart=always
ExecStart=$DOCKER start -a $CONTAINER
ExecStop=$DOCKER stop -t 2 $CONTAINER

[Install]
WantedBy=default.target
EOF
  chmod 664 /etc/systemd/system/$CONTAINER.service
  $SYSTEMCTL daemon-reload
  $SYSTEMCTL enable $CONTAINER.service
  $SYSTEMCTL start $CONTAINER
}

install_upstart_job() {
  echo "Installing Upstart job: $CONTAINER"
  cat > /etc/init/$CONTAINER.conf <<EOF
description "StrongLoop Process Manager Container"
author "StrongLoop <callback@strongloop.com>"
start on filesystem and started docker
stop on runlevel [!2345]
respawn
exec $DOCKER start -a $CONTAINER
EOF
  $INITCTL reload-configuration
  $INITCTL start $CONTAINER
}

install_other() {
  die "Sorry, only Upstart and systemd are supported so far"
}

add_env() {
  echo "Adding to container environment: $1=$2"
  CONTAINER_ENVS="$CONTAINER_ENVS --env $1=$2"
}

parse_options() {
  while [ $# -gt 0 ]; do
    K=${1%%=*}
    V=${1#*=}
    case $K in
      AUTH)
        add_env "STRONGLOOP_PM_HTTP_AUTH" $V
        ;;
      METRICS)
        add_env "STRONGLOOP_METRICS" $V
        ;;
      *)
        add_env $K $V
        ;;
    esac
    shift
  done
}

start_container() {
  echo "Downloading latest version of $IMAGE..."
  $DOCKER pull $IMAGE > /dev/null
  echo "Stopping existing service if installed..."
  $STOP $CONTAINER > /dev/null
  echo "Deleting existing $CONTAINER if it exists..."
  $DOCKER rm --force $CONTAINER 2> /dev/null
  echo "Starting $IMAGE as container $CONTAINER..."
  $DOCKER run $CONTAINER_ENVS \
    --detach --restart=no \
    --publish 8701:8701 --publish 3000:3000 \
    --name $CONTAINER \
    strongloop/strong-pm
}

require_docker
reject_remote_docker
detect_init
parse_options $*
start_container

case $INIT in
  upstart)
    install_upstart_job
    ;;
  systemd)
    install_systemd_service
    ;;
  *)
    install_other
esac
