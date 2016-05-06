[![strong-pm Logo](http://strong-pm.io/images/slpm%20logo.png)](http://strong-pm.io/)

# strong-pm - Process Manager

[![Gitter](https://badges.gitter.im/Join%20Chat.svg)](https://gitter.im/strongloop/chat?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

StrongLoop PM is a production process manager for Node.js applications with
built-in load balancing, monitoring, multi-host deployment, and a graphical
console.

For more details, see [http://strong-pm.io](http://strong-pm.io)

## Installation

_Requirements: `git` needs to be installed_

Install the client-side [CLI](https://github.com/strongloop/strongloop) and
[GUI](https://github.com/strongloop/strong-arc) (`slc arc`):

    npm install -g strongloop
    slc -h

Run app

    slc start app.js

Or to deploy and manage remotely, install the manager on a production server using npm:

    npm install -g strong-pm && sl-pm-install

Or using docker:

    curl -sSL http://strong-pm.io/docker.sh | sudo /bin/sh


## Quick Start

Under production, you will install the process manager as a system service, see
[http://strong-pm.io/prod](http://strong-pm.io/prod), but if you are just trying the manager out locally,
you can run an app directly from the command line.

Get a sample app (or use your own app):

    git clone git@github.com:strongloop/express-example-app.git
    cd express-example-app
    npm install

Start the app under the process manager:

    slc start

Interact with the app using the StrongLoop GUI:

    slc arc

See [http://strong-pm.io](http://strong-pm.io) for more information.


## Features

- Build, package, and deploy your Node application to a local or remote system
- Aggregate & rotate logs
- Built-in load balancing
- Keep processes and clusters alive forever
- Profile CPU to find event loop stalls
- Profile memory to find leaks
- View performance metrics on your application
- Use graphical tool or CLI
- Docker support

## Great for production!

- Supports remote deploy and management
- Git-based deploy for easy deployment versioning and rollback
- Deployment does not have external dependencies (production hosts don't have to
  fetch from npmjs.org or Git)
- Docker support
- Built and supported by Node core maintainers at StrongLoop, battle-tested by
  enterprise customers

## Build & Deploy

- Multi-host deploy
- Zero-downtime application restarts and upgrades
- Install dependencies, run custom build steps, and prune development
  dependencies without affecting your source tree
- SSH, HTTP, or Git-based deploy

## Profile

- Heap snapshots and CPU profiles
- Profile applications to find performance bottlenecks
- Use StrongLoop's unique event loop triggered profiling to start CPU profiling
  when the Node event loop stalls

## Manage processes and clusters

- Use all available CPU cores
- Automatic restart on failure
- Log aggregation and management
- Change cluster size, view clustering info remotely
- Set up secure access via SSH / HTTPS
- Manage Nginx load-balancer for multi-host deployments

## Metrics

- View performance metrics such as event loop times, CPU and memory consumption
- Publish metrics to StatsD-compatible servers, and view in 3rd-party consoles
  such as:
  - DataDog
  - Graphite
  - Splunk
  - Even syslog and raw log files
  - See Integrating with third-party consoles for details.
- Third-party probe metrics, for example for Memcached, MongoDB, Redis, MySQL,
  and so on.


## Docs & Community

- [StrongLoop Documentation](http://docs.strongloop.com/display/SLC/Operating+Node+applications)
- [Professional support](http://strongloop.com/node-js/subscription-plans/)
- [StrongLoop Google Group](https://groups.google.com/forum/#!forum/strongloop)
- [GitHub issues](https://github.com/strongloop/strong-pm/issues)
- [Gitter chat](https://gitter.im/strongloop/chat)
- [Install on production server](./INSTALL.md)
- [Application life-cycle](./LIFE-CYCLE.md)

For more resources, including links to blogs, see
[http://strong-pm.io/resources/](http://strong-pm.io/resources/).

## Troubleshooting

**Q: On deploy getting an `git: fatal: unable to access 'http://127.0.0.1:8701/default/': Empty reply from server**

A: Check to make sure `git` is installed

## License

You may use this library under the terms of the [Artistic 2.0 license][]

[Artistic 2.0 license]: http://opensource.org/licenses/Artistic-2.0
