## Installing via npm as a Service

The process manager should be installed as a service, under the control of the
system process manager. This will ensure it is started on machine boot, logs are
correctly aggregated, permissions are set correctly, etc.

The sl-pm-install tool does this installation for you, and supports the
following init systems:

- Upstart 0.6
- Upstart 1.4 (default)
- Systemd

In it's typical usage, you would install the `strong-pm` package globally on
the deployment system and then install it as a service:

    npm install -g strong-pm
    sl-pm-install

It will create a strong-pm user account with `/var/lib/strong-pm` set as its
home directory. If deploying to a hosted service, there may already be a user
account prepared that you want the manager to run as, you can specify it with
the `--user` option.

You can also `--job-file` to generate the service file locally, and move it to
the remote system manually.


## Installing via Docker Hub

This repository is the source of the
[strongloop/strong-pm](https://registry.hub.docker.com/u/strongloop/strong-pm/)
repo on Docker Hub. You can get started as quickly as:

    docker pull strongloop/strong-pm
    docker run -d -p 8701:8701 -p 80:3000 --name strong-pm strongloop/strong-pm

And now you've got a strong-pm container up and running. You can deploy to it
with `slc deploy http://localhost:8701`.

This image can be run as an OS service without the need to install strong-pm,
npm, or even node on your server. All you need is Docker and curl!

    curl -sSL http://strong-pm.io/docker.sh | sudo /bin/sh

The created service will use port 8701 for strong-pm's API, port 3000 for your
app, and the container will be restarted if your server reboots.

If you want to step through all the steps yourself, the script is based off of
a guide in [docker/README.md](docker/README.md).

For more information on Docker and Docker Hub, see https://www.docker.com/
