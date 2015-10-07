# Dockerizing StrongLoop PM the Hard Way

A quick guide on how to install and use the `strongloop/strong-pm` docker
image.

## Requirements

Setting up a server can be daunting, and installing node on a server isn't
always a walk in the park either. Fortunately, we're talking about Docker
here so we get to wave a wand and make all our problems go away! Well, not
_all_ our problems, but at least a few.

Here's what our server needs:

1. A host (physical or virtual) capable of running Docker!
  * I recommend something RHEL/Fedora based because of the extra
    protection offered in the event that your docker container is
    breached.
2. That's it! You don't even need to install Node on your server!

Here's what your workstation needs:

1. Node.

Since this article is about deployment rather than development I won't be
covering how to install Node in your dev environment. Sorry.

## Procedure

Here's the general recipe:

1. Install Docker
2. Install the strong-pm docker image
3. Deploy your app!

### Install Docker

Many (many, many) articles have been written about how to install Docker.
Personally, I found the official documentation to be the best. If you are
in a rush, though, if you are running Ubuntu, Debian, Linux Mint, Fedora,
AWS Linux, CentOS, or RHEL, and the version you are running was released
in the last year or so, there's a handy one-line installer you can use:

    curl -sSL https://get.docker.com/ | sudo sh

If you aren't lucky enough to have that work for you, I'm sorry to say
you'll probably have to go read the docs. :-(

> Protip! I highly recommend following the instructions for `sudo`-less
> docker.

### Install The `strongloop/strong-pm` Docker Image

In short, what we need to do now is pull down the strong-pm docker
image, start it up, and then set up an init script to make sure it
starts the next time your server reboots.

Conveniently, if Docker is told to run an image that hasn't been pulled
yet, it will pull it automatically. This means you can cover the first
two steps with the following command:

    docker run --detach --restart=no \
      --publish 8701:8701 --publish 3001:3001 \
      --publish 3002:3002 --publish 3003:3003 \
      --name strong-pm-container \
      strongloop/strong-pm

Great! Now you've downloaded the `strongloop/strong-pm` docker image,
started a new container in the background (`--detach`) named `my-app-pm`.
Additionally, we've told it to publish container ports `8701` and `3001-3003`
as host ports `8701` and `3001-3003`, respectively.

If you don't care about your application coming back up after a server
reboot and you just want to take it for a spin, you're done with this
part and you can go straight to **Deploying Your App**.

If you want to set up something a little closer to production, we've got
one more step.

If you care about your app's uptime then the bare-minimum you can do is
make sure that it restarts if it crashes. The good news is you're already
running your app under a process manager that will restart your app for
you. But what about a server reboot? No amount of JavaScript can save you
from a power outage, so you've got to get some help from the host OS.

This is where Upstart and systemd come in. If you were lucky enough to
have the one-liner in **Installing Docker** work for you then there's a
good chance you're running a system that comes with Upstart.

If you've already drank the systemd Kool-aid, then you can follow those
instructions.

#### Upstart

If you are in a rush you can probably get away with simply copying the
following example in to `/etc/init/strong-pm-container.conf`:

```upstart
description "StrongLoop Process Manager Container"
author "StrongLoop <callback@strongloop.com>"
start on filesystem and started docker
stop on runlevel [!2345]
respawn
exec /usr/bin/docker start -a strong-pm-container
```

#### systemd

If you've drank the systemd kool-aid, you'll want to create a target
like this one:

```systemd
[Unit]
Description=StrongLoop Process Manager Container
Author=StrongLoop <callback@strongloop.com>
After=docker.service

[Service]
Restart=always
ExecStart=$DOCKER start -a strong-pm-container
ExecStop=$DOCKER stop -t 2 strong-pm-container

[Install]
WantedBy=default.target
```

Just like with the Upstart job, this one is so simple you can probably
just copy/paste the above systemd example right in to
`/etc/systemd/system/strong-pm-container.service`.

### Deploy Your App

Alright, now that we've installed Docker and a containerized instance of
the StrongLoop Process Manager, we're ready to deploy our app.

This one is easy: `slc deploy http://docker-host:8701/`
