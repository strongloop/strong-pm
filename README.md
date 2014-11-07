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
- files to add to application's working directory

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

### Files

The manager can be configured to add files to the working directory of
the application. This is useful to avoid deploy-time configuration being
present in the application package. The files should be named in a specific
`files` section of the config file. The allowed syntax is either

- `dst = src`: the file `src` will be copied into the working copy, and named
  `dst`
- `src`: the file `src` will be copied into the working copy, and named
  `src`

If not qualified, the `src` filenames are resolved to the same directory as
the config file.

Example:

```
[files]
strongloop.json  ; copy this file into every working directory

[config-dev.files]
.env=dev.env     ; copy dev.env to .env

[config-prod.files]
.env=prod.env    ; copy prod.env to .env
```


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
  -h,--help           Print this message and exit.
  -v,--version        Print version and exit.
  -m,--metrics STATS  Specify --metrics option for supervisor running
                      deployed applications.
  -b,--base BASE      Base directory to work in (default is .strong-pm).
  -c,--config CONFIG  Config file (default BASE/config).
  -e,--set-env K=V... Initial application environment variables. If
                      setting multiple variables they must be quoted
                      into a single argument: "K1=V1 K2=V2 K3=V3".
  -u,--user USER      User to run manager as (default is strong-pm).
  -p,--port PORT      Listen on PORT for application deployment (no
                      default).
  -n,--dry-run        Don't write any files.
  -j,--job-file FILE  Path of Upstart job to create (default is
                      /etc/init/strong-pm.conf)
  -f,--force          Overwrite existing job file if present
  --upstart VERSION   Specify the version of Upstart, 1.4 or 0.6
                      (default is 1.4)
```

The URL formats supported by `--meetrics STATS` are defined by strong-supervisor.

### slc pmctl

```
usage: slc pmctl [options] [command]
usage: sl-pmctl [options] [command]

Run-time control of the process manager.

Options:
  -h,--help               Print help and exit.
  -v,--version            Print version and exit.
  -C,--control CTL        Control channel to connect to.

Commands:
  status                  Report status, the default command.
  shutdown                Stop the process manager.
  start                   Start the current application.
  stop                    Hard stop the current application.
  soft-stop               Soft stop the current application.
  restart                 Hard stop and restart the current application with
                            new config.
  soft-restart            Soft stop and restart the current application with
                            new config.
  cluster-restart         Restart the current application cluster workers.
  set-size N              Set cluster size to N workers.
  objects-start W         Start tracking objects on worker W.
  objects-stop W          Stop tracking objects on worker W.
  cpu-start W             Start CPU profiling on ID, use cpu-stop to save
                            profile.
  cpu-stop W [NAME]       Stop CPU profiling on worker W, save as
                            `NAME.cpuprofile`.
  heap-snapshot W [NAME]  Save heap snapshot for worker W, save as
                            `NAME.heapsnapshot`.
  ls [DEPTH]              List dependencies of the current application.
  env-set K=V...          Set one or more environment variables for current
                          application and hard restart it with new environment.
  env-unset KEYS...       Unset one or more environment variables for current
                          application and hard restart it with the new
                          environment.
  env[-get] [KEYS...]     List specified environment variables. If none are
                          given, list all variables.

"Soft" stops notify workers they are being disconnected, and give them a grace
period for any existing connections to finish. "Hard" stops kill the supervisor
and its workers with `SIGTERM`.

Worker `W` is either a node cluster worker ID, or an operating system process
ID. The special worker ID `0` can be used to identify the master.

Profiling:

Object tracking is published as metrics, and requires configuration so that the
`--metrics=URL` option is passed to the runner.

CPU profiles must be loaded into Chrome Dev Tools. The NAME is optional,
profiles default to being named `node.<PID>.cpuprofile`.

Heap snapshots must be loaded into Chrome Dev Tools. The NAME is optional,
snapshots default to being named `node.<PID>.heapsnapshot`.
```
