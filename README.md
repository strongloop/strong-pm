# strong-pm

StrongLoop process manager.

## Installation

    npm install -g strong-pm

## Quick Start

It is recommend to install the process manager as a system service, see below,
but if you are just trying the manager out to try it, it can be run directly
from the command line.

Run strong-pm server on a free port, `7777` in this example:

    slc pm -l 7777

Clone and push an app, the loopback example app in this example, but
any node application can be managed:

    git clone git@github.com:strongloop/loopback-example-app.git
    cd loopback-example-app
    slc deploy http://localhost:7777

That was a non-production push, it installed all your dependencies on the
server. You should always build your app so the dependencies are built-in, and
not installed dynamically at run-time:

    git clone git@github.com:strongloop/loopback-example-app.git
    cd loopback-example-app
    slc build
    slc deploy http://localhost:7777

See [strong-build](https://github.com/strongloop/strong-build) and
[strong-deploy](https://github.com/strongloop/strong-deploy) for more
information.

## Options

The following options are supported:

- `--listen PORT`: the port to listen to for deployments, mandatory
  (unfortunately, there are no reasonable defaults).

- `--base BASE`: the base is the directory that strong-pm will use to save
  applications deployed to it, both the git repos and npm packages, as
  well as the working directories, and any other files it needs to create.
  It defaults to `.strong-pm` in the current working directory when
  run from the command line, but see `pm-install`.

- `--config CFG`: the config file can be use to customize the behaviour of the
  manager, if necessary, see below. It defaults to a file called `config` in the
  `<BASE>` directory.

## Life-cycle

When applications are deployed to the manager, it first prepares them. The
prepare commands default to `npm rebuild; npm install --production`. Since
`npm install` is called, the preparation may be customized using npm scripts,
if necessary.

After preparation, the application is run. The run command defaults to `sl-run
--cluster=cpus`.  The start command is the only thing likely to need
configuration.

A hard stop is performed by killing the supervisor with `SIGTERM`. The signal
is configurable, but we do not recommend changing it.

A soft restart is performed by killing the supervisor with `SIGHUP`. The signal
is configurable, and may be set to `"no"` to disable soft restart, but we do not
recommend changing it.


## Configuration

The start command may be customized if necessary, see
[strong-supervisor](http://github.com/strongloop/strong-supervisor) for
supported options. Useful configuration options are those where the defaults may
not reasonably work for all deployments: `--metrics`, timestamping, and perhaps
cluster size.

The config file is in [ini](https://www.npmjs.org/package/ini) format.

Configurable items are:

- prepare command: an array of commands, shell syntax is *not* supported
- start command: a single command, shell syntax is *not* supported
- stop signal
- restart signal

The configuration for each item is the last found of:

1. the builtin defaults
2. the global configuration section
3. the specific configuration matching the `--config` option of
   [slc deploy](http://github.com/strongloop/strong-deploy)


Example:

    ; these are the defaults
    prepare[] = npm rebuild
    prepare[] = npm install --production
    start = sl-run --cluster=CPU
    stop = SIGTERM
    restart = SIGHUP

    ; these are overrides for a particular repo, deploy to it like:
    ;   slc deploy --config config-one http://example.com:7777
    ; this configuration is valid, but probably not useful (pmctl, for
    ; example, will not support many commands if the supervisor is not
    ; used)
    [config-one]
    ; no prepare
    prepare =
    ; run with node
    start = node .
    ; single instance node doesn't support restart
    restart = no

## Installation as a Service

.. TODO ..

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
