# StrongLoop Process Manager

## Installation

    npm install -g strongloop

## Quick Start

Run strong-pm server:

    slc pm -l 7777

Clone and push an app:

    git clone git@github.com:strongloop/loopback-example-app.git
    cd loopback-example-app
    slc deploy http://localhost:7777/repo

That was a non-production push, it installed all your dependencies on the
server. You should always build your app so the dependencies are built-in, and
not installed dynamically at run-time:

    slc build --install --commit
    slc deploy http://localhost:7777/repo

See [strong-build](https://github.com/strongloop/strong-build) and
[strong-deploy](https://github.com/strongloop/strong-deploy) for more
information.

## Config notes

The config file is ini format. It defaults to being the file `config`
in the `base` directory (but see `--config` option).

Configurable are:

- prepare command: defaults to `npm rebuild; npm install --production`
- start command: defaults to `sl-run --cluster=cpus`
- stop signal: defaults to `SIGTERM`
- restart signal: defaults to `SIGHUP`

Configuration can be global, or per repo pushed to.

Push from git with a command like `git push http://localhost:PORT/REPO`, or
use slc as `slc deploy http://HOST:PORT/REPO`.

PORT is arg to --listen, REPO you decide but is not optional.

Example:

    ; these are the defaults
    prepare[] = npm rebuild
    prepare[] = npm install --production
    start = sl-run --cluster=CPU
    stop = SIGTERM
    restart = SIGHUP

    ; these are overrides for a particular repo, deploy to it like:
    ;   slc deploy http://host:port/config-one
    [config-one]
    ; no prepare
    prepare =
    ; run with node
    start = node .
    ; single instance node doesn't support restart
    restart = no

## Usage

### slc pm

```
usage: slc pm [options]
usage: slpm [options]

Options:
  -h,--help         Print this message and exit.
  -v,--version      Print version and exit.
  -b,--base BASE    Base directory to work in (default .strong-pm).
  -c,--config       Config file (default BASE/config).
  -l,--listen PORT  Listen on PORT for git pushes (no default).
```

### slc pm-install

```
usage: slc pm-install [options]
usage: sl-pm-install [options]

Options:
  -h,--help         Print this message and exit.
  -v,--version      Print version and exit.
  -b,--base BASE    Base directory to work in (default .strong-deploy).
  -c,--config       Config file (default BASE/config).
  -u,--user         User to run sl-pm as (default current user).
  -p,--port PORT    Listen on PORT for git pushes (no default).
  -n,--dry-run      Don't write any files.
  -j,--job-file     Path of Upstart job to create (default /etc/init/strong-pm.conf)
  -f,--force        Overwrite existing job file if present
```
