# strong-pm

StrongLoop process manager.

## Installation

    npm install -g strong-pm

## Quick Start

It is recommend to install the process manager as a system service, see below,
but if you are just trying the manager out to try it, it can be run directly
from the command line.

Run process manager on a free port, `7777` in this example:

    sl-pm -l 7777

Clone and push an app, the loopback example app in this example, but
any node application can be managed:

    git clone git@github.com:strongloop/loopback-example-app.git
    cd loopback-example-app
    sl-deploy http://localhost:7777

That was a non-production push, it installed all your dependencies on the
server. You should always build your app so the dependencies are built-in, and
not installed dynamically at run-time:

    git clone git@github.com:strongloop/loopback-example-app.git
    cd loopback-example-app
    sl-build
    sl-deploy http://localhost:7777

See [strong-build](https://github.com/strongloop/strong-build) and
[strong-deploy](https://github.com/strongloop/strong-deploy) for more
information.

## Metrics

Metrics-related features (`slc run --metrics`, `slc pmctl objects-start`, etc.),
requires a license, please contact
[sales@strongloop.com](mailto:sales@strongloop.com).

## Options

The following options are supported:

- `--listen PORT`: the port to listen to for deployments, mandatory
  (unfortunately, there are no reasonable defaults).

- `--base BASE`: the base is the directory that strong-pm will use to save
  applications deployed to it, both the git repos and npm packages, as
  well as the working directories, and any other files it needs to create.
  It defaults to `.strong-pm` in the current working directory when
  run from the command line, but see `pm-install`.

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

Configuration of strong-pm itself (port, base directory, etc.) is controlled by
CLI arguments and environment variables when strong-pm is started.

Configuration of the application and its runtime are controlled by a combination
of the application's package.json and the environment variables strong-pm
provides to it.

These environment variables can be manipulated using the `env` sub-command to
pmctl.

Examples:
- List current environment: `slc pmctl env`
- Add/set single variable: `slc pmctl env PORT=4321`
- Add/set multiple variables: `slc pmctl env PORT=4321 WORKERS=4 NODE_ENV=staging`
- Unset single variable: `slc pmctl env PORT=`
- Unset multiple variables: `slc pmctl env PORT= WORKERS= NODE_ENV=`
- Corner case, set to empty string: `slc pmctl env PORT=''`

### Files

The manager can be configured to add files to the working directory of
the application. This is useful to avoid deploy-time configuration being
present in the application package.

These files can be set using the `inject-file` sub-command of pmctl, optionally
including a mapping:

- `dst=src`: the file `src` will be copied into the working copy, and named
  `dst`
- `src`: the file `src` will be copied into the working copy, and named using
  the basename of `src`

The file given by `src` is uploaded to strong-pm and stored there for future
application restarts.  If `src` is a path, it is trimmed to just the file name for the purposes of
mapping.

Example:

- `slc pmctl inject-file strongloop.json`
  - upload strongloop.json from current directory and inject it into the
    application environment at deployment time.
- `slc pmctl inject-file /path/to/global/default:strongloop.json`
  - upload the file at `/path/to/global/default` and inject it into the
    applicaiton environment at deployment time as `strongloop.json`
- `slc pmctl inject-file strongloop.json:`
  - remove the strongloop.json file stored in strong-pm for deployments
- `slc pmctl inject-file :strongloop.json`
  - remove the strongloop.json file from application environment if it
    is found at deployment time.


## Installation as a Service

The process manager should be installed as a service, so it gets integration
with the system process manager. This will ensure it is started on machine boot,
logs are correctly aggregated, permissions are set correctly, etc.

The pm-install tool does this installation.

In it's typical usage, you would install strongloop globally on the deployment
system (`npm install -g strongloop`), and then call `slc pm-install` with
`--port` to set the deployment port to listen on. It will create a strong-pm
user account with `/var/lib/strong-pm` set as its home directory. If deploying
to a hosted service, there may already be a user account prepared that you want
the manager to run as, you can specify it with the `--user` option.

You can also `--job-file` to generate the upstart conf-file locally, and move
it to the remote system.

To save time, the environment and file injections can be pre-seeded at service
installation time with the `--env` and `--inject-file` options of `slc pm-install`.

## Usage

### slc pm

```
usage: slc pm [options]
usage: sl-pm [options]

Options:
  -h,--help         Print this message and exit.
  -v,--version      Print version and exit.
  -b,--base BASE    Base directory to work in (default .strong-pm).
  -l,--listen PORT  Listen on PORT for git pushes (no default).
  -C,--control CTL  Listen for control messages on CTL (default pmctl).
  --no-control      Do not listen for control messages.
```

### slc pm-install

```
usage: slc pm-install [options]
usage: sl-pm-install [options]

Options:
  -h,--help           Print this message and exit.
  -v,--version        Print version and exit.
  -b,--base BASE      Base directory to work in (default is .strong-pm).
  -u,--user USER      User to run manager as (default is strong-pm).
  -p,--port PORT      Listen on PORT for application deployment (no default).
  -n,--dry-run        Don't write any files.
  -j,--job-file FILE  Path of Upstart job to create (default is /etc/init/strong-pm.conf)
  -f,--force          Overwrite existing job file if present
  --upstart VERSION   Specify the version of Upstart, 1.4 or 0.6 (default is 1.4)
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
  ls [DEPTH]              List dependencies of the current application.
  env [KEY=VALUE...]      List or set environment variables for current application.
  inject-file <FILEMAP>   Define file injection mapping for current application.

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
