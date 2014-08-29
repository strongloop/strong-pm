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
usage: sl-pm [options]

Options:
  -h,--help         Print this message and exit.
  -v,--version      Print version and exit.
  -b,--base BASE    Base directory to work in (default .strong-pm).
  -c,--config CFG   Config file (default BASE/config).
  -l,--listen PORT  Listen on PORT for git pushes (no default).
  -C,--control CTL  Listen for control messages on CTL (default pmctl).
  --no-control      Do not listen for control messages.
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

### slc pmctl

```
usage: slc pmctl [options] [command]
usage: sl-pmctl [options] [command]

Run-time control of the process manager.

Options:
  -h,--help               Print help and exit.
  -v,--version            Print version and exit.

Commands:
  status                  Report status, the default command.
  shutdown                Stop the process manager.
  start                   Start the current application.
  stop                    Hard stop the current application.
  soft-stop               Soft stop the current application.
  restart                 Hard stop and restart the current application with new config.
  soft-restart            Soft stop and restart the current application with new config.
  cluster-restart         Restart the current application cluster workers.
  set-size N              Set cluster size to N workers.
  objects-start T         Start tracking objects on T, a worker ID or process PID.
  objects-stop T          Stop tracking objects on T.
  cpu-start T             Start CPU profiling on T, use cpu-stop to save profile.
  cpu-stop T [NAME]       Stop CPU profiling on T, save as `NAME.cpuprofile`.
  heap-snapshot T [NAME]  Save heap snapshot on T, save as `NAME.heapsnapshot`.

"Soft" stops notify workers they are being disconnected, and give them a
grace period for any existing connections to finish. "Hard" stops kill the
supervisor and its workers with `SIGTERM`.

Profiling:

Either a node cluster worker ID, or an operating system process
ID can be used to identify the node instance to target to start
profiling of objects or CPU. The special worker ID `0` can be used
to identify the master.

Object tracking is published as metrics, and requires configuration
so that the `--metrics=URL` option is passed to the runner.

CPU profiles must be loaded into Chrome Dev Tools. The NAME is
optional, profiles default to being named `node.<PID>.cpuprofile`.

Heap snapshots must be loaded into Chrome Dev Tools. The NAME is
optional, snapshots default to being named `node.<PID>.heapsnapshot`.
```
