2016-06-21, Version 5.2.3
=========================

 * lint: update to 2.x (Sam Roberts)

 * lint: clean up function spacing (Ryan Graham)

 * lint: fix indentation warnings (Ryan Graham)

 * lint: opt-out of comma-dangle rule (Ryan Graham)

 * package: update strong-deploy to 3.x (Sam Roberts)

 * package: update tar to 2.x (Sam Roberts)


2016-05-24, Version 5.2.2
=========================

 * Make minkelite optional (Krishna Raman)

 * update/insert copyright notices (Ryan Graham)

 * Update pm error message when db upgrade fails. (Rick Curtis)


2016-04-11, Version 5.2.1
=========================

 * Make sqlite an optional PM dependency (Rick Curtis)

 * docker: add variants for major node versions (Ryan Graham)


2016-02-09, Version 5.2.0
=========================

 * Revert name change of JSON db file (Krishna Raman)

 * Switch to using `sqlite` as PM database (Krishna Raman)


2015-12-21, Version 5.1.0
=========================

 * add --skip-default-install option (Ryan Graham)

 * lint: trim/wrap long lines (Ryan Graham)

 * test: autoskip tests requiring a license (Ryan Graham)

 * lint: clean up function spacing and caps (Ryan Graham)

 * lint: fix indentation warnings (Ryan Graham)

 * lint: fix comma-dangle (Ryan Graham)

 * lint: fix spaced comments (Ryan Graham)

 * lint: fix extraneous whitespace in parens (Ryan Graham)

 * lint: remove useless .call() usages (Ryan Graham)

 * lint: fix quoted-keys (Ryan Graham)

 * Update eslint to strongloop conventions (Ryan Graham)

 * Refer to licenses with a link (Sam Roberts)

 * docker: update image and docs (Ryan Graham)


2015-10-05, Version 5.0.1
=========================

 * always uses localhost for ws on direct driver (Ryan Graham)

 * set 'url' on mesh app before emitting 'started' (Ryan Graham)

 * Bring back `/explorer` (Miroslav Bajtoš)

 * tracing: start runner with correct trace state (Sam Roberts)

 * server: debug log only the start of notifications (Sam Roberts)

 * Use strongloop conventions for licensing (Sam Roberts)

 * container: current symlink is absolute (Sam Roberts)

 * control: fallback to localhost control channel (Sam Roberts)

 * test: use correct test instance for assertions (Ryan Graham)

 * test: don't let wsRouter timeout tests (Ryan Graham)

 * Use a named file minkelite.db with overwrite option. (Tetsuo Seto)

 * pm: startup log of base dir and pid (Sam Roberts)


2015-07-27, Version 5.0.0
=========================

 * test: use generic DOCKER_HOST for docker e2e tests (Ryan Graham)

 * docker: provide more actionable message on docker error (Ryan Graham)

 * docker: properly report error on docker startup (Ryan Graham)

 * pm-install: describe invalid port when erroring (Sam Roberts)

 * package: remove --save from tap options (Sam Roberts)

 * Allow app base port to be configurable (Sam Roberts)

 * package: eslint update (Sam Roberts)

 * drivers: update to new ws control api (Sam Roberts)

 * docker: error with message on docker unavailable (Sam Roberts)

 * test: mocked console object must support .log() (Sam Roberts)

 * test: remove extra t.end() from test-server (Sam Roberts)

 * direct: remove obsolete XXX notes (Sam Roberts)

 * upgrade installer to use strong-service-install@2 (Ryan Graham)

 * test: make vagrant test bail more informative (Ryan Graham)

 * test: partially fix windows (Bert Belder)

 * test: fix failing test due to incomplete mock (Ryan Graham)

 * service-manager: allow application port to be set (Sam Roberts)

 * Set override trace hostname to return instanceId (Krishna Raman)

 * docker: remove non-websocket ctl channel support (Ryan Graham)

 * docker: make driver startup more reliable (Ryan Graham)

 * server: skip 'status' after 'started' notification (Ryan Graham)

 * test: update vagrant e2e tests (Ryan Graham)

 * drivers: use first non-internal IP for WS urls (Ryan Graham)

 * drivers: consolidate WS channel creation code (Ryan Graham)

 * always use a websocket control channel (Ryan Graham)

 * docker: start cluster at full size (Ryan Graham)

 * docker: simplify container port bindings (Ryan Graham)

 * server: pass WS router to drivers (Ryan Graham)

 * cli: add --driver from CLI usage (Ryan Graham)

 * fixup (Sam Roberts)

 * fixup! test: passing eslint (Sam Roberts)

 * ... this was removed on master, fixup (Sam Roberts)

 * test: passing eslint (Sam Roberts)

 * test: fix profiling license/platform variations (Sam Roberts)

 * test: t.skip does not exist, fix tests (Sam Roberts)

 * Default base dir in the home directory (Sam Roberts)

 * test: remove duplicate test, start-stop-restart (Sam Roberts)

 * test: removed unused BASE variables (Sam Roberts)

 * sl-pmctl: removed help for removed pmctl utility (Sam Roberts)

 * docker: use WebSocket control channel if provided (Ryan Graham)

 * use router in strong-control-channel@2 (Ryan Graham)

 * docker: fix ignored container exit (Ryan Graham)

 * service-manager: fix error in error handler (Ryan Graham)

 * docker: make internal instance an EventEmitter (Ryan Graham)

 * refactor: docker: extract _proxyRequest method (Ryan Graham)

 * docker: fix started message to match new format (Ryan Graham)

 * docker: expose instance to Container (Ryan Graham)

 * refactor: docker images aren't instance specific (Ryan Graham)

 * docker: refactor instance lookup (Ryan Graham)

 * docker: fix cluster size in start options (Ryan Graham)

 * Bump runner and mesh-models dependency versions Fix tests to emit notifications with wid fields (Krishna Raman)

 * Update eslint to 0.22 (Sam Roberts)

 * test: don't rely on PATH for sl-build & sl-deploy (Ryan Graham)

 * deps: use latest strong-build in tests (Ryan Graham)

 * Remove local domain control socket support (Sam Roberts)

 * Remove CLI code from module entry point (Sam Roberts)

 * test: use tap and the cli, not async/internal apis (Sam Roberts)


2015-06-10, Version 4.2.1
=========================

 * test: tapify test-server-metadata (Ryan Graham)

 * test: update expectations for persisted set-size (Ryan Graham)

 * package: update license to SPDX expression (Ryan Graham)

 * gitignore minkelite.db (Sam Roberts)

 * test: fix e2e docker test (Ryan Graham)

 * Upgrade tap to 1.x (Sam Roberts)

 * Update runner cmdline when tracing/size is changed (Krishna Raman)


2015-06-03, Version 4.2.0
=========================

 * docker: remove --driver from CLI usage (Sam Roberts)

 * Fix strict mode warning about function scope (Ryan Graham)

 * log app logs to PM's log (Ryan Graham)

 * server: disable websockets until needed (Sam Roberts)

 * fixup, channel destroy (Sam Roberts)

 * direct: use websockets for control channel (Sam Roberts)

 * server: print listening host correctly (Sam Roberts)

 * docker: record container id in driverMeta (Ryan Graham)

 * add driverMeta field to instance data (Ryan Graham)

 * fix docker detection when not run as root (Ryan Graham)

 * install: check for usable docker environment (Ryan Graham)

 * install: add existing user to docker group (Ryan Graham)

 * install: add strong-pm user to docker group (Ryan Graham)

 * fix: env-unset doesn't work on dockerized apps (Ryan Graham)

 * install: run strong-pm under docker group if needed (Ryan Graham)

 * test: make e2e vagrant test cover docker driver (Ryan Graham)

 * Add blip (Sam Roberts)

 * Distinguish REST API and js API version (Sam Roberts)

 * Rename enableTracing field on instance model (Krishna Raman)

 * Allow enable/disable of tracing per instance (Krishna Raman)

 * Move Minkelite dependency from mesh-models to PM (Krishna Raman)

 * refactor: remove Driver#_containerById interface (Ryan Graham)

 * refactor: remove container refs from server (Ryan Graham)

 * Upgrade strong-runner to v2.x (Sam Roberts)

 * refactor: extract log buffer from drivers (Ryan Graham)

 * refactor: move child exit handling in to driver (Ryan Graham)

 * test: DockerDriver#setStartOptions (Ryan Graham)

 * test: test docker driver startup (Ryan Graham)

 * test: minimal test for docker instance (Ryan Graham)

 * install: add --driver option (Ryan Graham)

 * pm: add --driver option (Ryan Graham)

 * Add docker driver to dockerize apps on deployment (Ryan Graham)

 * test: fix test-server to provide start time (Ryan Graham)

 * direct: fix child check in log-dump handler (Ryan Graham)

 * fix inconsistency in pm log message (Ryan Graham)

 * server: allow driver to specify parent pid (Ryan Graham)

 * direct: handle listening events for domain sockets (Ryan Graham)

 * test: wait for startup in docker e2e test (Ryan Graham)

 * ensure PORT env variable is stored as a string (Ryan Graham)

 * service-manager: fix check for process stopped (Sam Roberts)

 * Mark processes dead more robustly on startup (Sam Roberts)

 * server: honour setSize on started message if set (Ryan Graham)

 * ensure STRONGLOOP_LICENSE is inherited from PM (Ryan Graham)

 * deps: update eslint (Ryan Graham)

 * test: simplify log-dump tests (Ryan Graham)

 * test: fix driver tests tap usage (Ryan Graham)

 * test: mark test-server-metadata for tap@1 (Ryan Graham)

 * test: make test-usage tap@1 safe (Ryan Graham)

 * test: make test-pmctl-rest-digest-auth tap@1 safe (Ryan Graham)

 * test: use common.sh helper for e2e tests (Ryan Graham)

 * test: ensure bash tests are run inside test/ (Ryan Graham)

 * test: make common.sh helper more TAP compliant (Ryan Graham)


2015-05-14, Version 4.1.1
=========================

 * service-manager: robust to missing json (Sam Roberts)

 * eslint: allow new without parentheses (Sam Roberts)


2015-05-08, Version 4.1.0
=========================

 * fix debug logging of app preparation (Ryan Graham)

 * driver: implement changing cluster size (Ryan Graham)

 * Fix default cluster size not honouring environment (Ryan Graham)

 * prepare: redirect stderr to stdout (Ryan Graham)

 * service-manager: implement cluster set-size (Sam Roberts)

 * test: fix missing lodash in test-server.js (Ryan Graham)

 * server: support old-style deploy to / (Sam Roberts)

 * test: use same node version as host for e2e tests (Ryan Graham)

 * test: make server-metadata test more robust (Ryan Graham)

 * test: reduce noise on 'npm test' (Ryan Graham)

 * server: comments working towards rework of container private meta info (Sam Roberts)

 * service-manager: add debug statements and comments (Sam Roberts)

 * package: run lint as part of pre-test (Sam Roberts)

 * test: update generic driver API test (Ryan Graham)

 * refactor: move deployment helpers to drivers/common (Ryan Graham)

 * refactor: simplify direct-driver path (Ryan Graham)

 * server: honour async service shutdown (Ryan Graham)

 * fix driver 'listening' event handling (Ryan Graham)


2015-04-30, Version 4.0.0
=========================

 * log when an app/service starts listening on a port (Ryan Graham)

 * ctl: default to instance id 1 (Ryan Graham)

 * test: test ctl 'current' commands (Ryan Graham)

 * fix env-set from pm@3.x pmctl clients (Ryan Graham)

 * test: unit tests for ctl handlers (Ryan Graham)

 * update ctl handler to use instance env (Ryan Graham)

 * package: bump to 4.x for multi-app support (Sam Roberts)

 * Support multiple managed applications (Sam Roberts)

 * test: move test-start-restart to strong-runner (Sam Roberts)

 * service-manager: ctlRequest renamed to onCtlRequest (Sam Roberts)

 * service-manager: reformat to reduce line lengths (Sam Roberts)

 * package: loopback-sdk-angular is unused (Sam Roberts)

 * package: update eslint (Sam Roberts)

 * package: remove unused 'build' script (Sam Roberts)

 * server: refactor inline event listeners to methods (Sam Roberts)

 * server: always use onCtlRequest name (Sam Roberts)

 * ctl: don't depend on server private properties (Sam Roberts)

 * server: rename _app to _meshApp (Sam Roberts)

 * pm: remove fake metrics (-F) (Sam Roberts)

 * receive: pass baseApp, don't use private property (Sam Roberts)

 * lib: remove unused _deploymentReceiver property (Sam Roberts)

 * lib: refactor to use strong-runner (Sam Roberts)

 * server: in-line XXX comments on future changes (Sam Roberts)

 * test: server-metadata, assert on pmctl error (Sam Roberts)

 * test: use assert.notEqual(), not assert(x != y) (Sam Roberts)

 * ctl: rename "app" to "server" (Sam Roberts)

 * docker: use official node image as base (Ryan Graham)

 * Add extra blank line (Ryan Schumacher)

 * Add message about git requirement (Ryan Schumacher)

 * fix typo in user visible error message (Setogit)

 * install: fix typo in auth option checking (Ryan Graham)

 * docs: fix curl commands in docker instructions (Ryan Graham)

 * test: simplify express-usage-record format check (Ryan Graham)

 * test: use make 'old' record 25 hours old (Ryan Graham)

 * docker: expose port 3000 by default (Ryan Graham)

 * fixme! review comment (Krishna Raman)

 * set trace.enableDebugServer from process.env.STRONGLOOP_DEBUG_MINKELITE (Setogit)

 * Add option which enables tracing (Krishna Raman)

 * Fix metadata tests (Krishna Raman)

 * Remove npm module list from instance model (Krishna Raman)


2015-03-27, Version 3.1.9
=========================

 * Fix markdown for links in README.md (Krishna Raman)

 * Update README.md (chandadharap)


2015-03-27, Version 3.1.8
=========================

 * package: add PM logo to README (Sam Roberts)


2015-03-27, Version 3.1.7
=========================

 * Update README for strong-pm.io (Sam Roberts)

 * ctl: report versions in status response (Sam Roberts)

 * docker: fix docker detection in installer (Ryan Graham)


2015-03-20, Version 3.1.5
=========================

 * server: report pm and API version at startup (Sam Roberts)


2015-03-20, Version 3.1.4
=========================

 * Fix windows support (Bert Belder)


2015-03-18, Version 3.1.3
=========================

 * package: update strong-mesh-models to 5.x (Sam Roberts)


2015-03-18, Version 3.1.2
=========================

 * Update pmctl usage in README (Sam Roberts)

 * docs: fix typo in docker install instructions (Ryan Graham)

 * Make sl-pmctl a wrapper around meshctl (Krishna Raman)


2015-03-16, Version 3.1.0
=========================

 * docker: add simple dockerized strong-pm installer (Ryan Graham)

 * docker: guide for manually installing docker image (Ryan Graham)

 * docker: use existing git installation (Ryan Graham)

 * test: tidy up Vagrant e2e tests (Ryan Graham)

 * pm-install: preserve basedir during upgrade (Ryan Graham)

 * test: fix typo in pm-install auth test (Ryan Graham)

 * Pass description option when installing service (braincomb)

 * lint: add .eslintignore (Sam Roberts)

 * pmctl: final control default is localhost:8701 (Sam Roberts)

 * pmctl: report control URL on failure (Sam Roberts)

 * pmctl: remove `config` from status (Sam Roberts)

 * lint: exclude files via config, not npm script (Sam Roberts)

 * Typo: "meetrics" (Rand McKinney)


2015-03-09, Version 3.0.0
=========================

 * make usage-record consistent with mesh models (Ryan Graham)

 * deps: upgrade eslint (Ryan Graham)

 * fix unsetEnv handler returning modified env (Ryan Graham)

 * deps: update tap dependency (Ryan Graham)

 * lint: fix warnings introduced by #138 (Ryan Graham)

 * local-deploy: use concat-stream, and adjust debug (Sam Roberts)

 * lint: update eslint to 0.15.1 (Sam Roberts)

 * docker: don't create extra .strong-pm directory (Ryan Graham)

 * docker: use strong-pm default port, 8701 (Ryan Graham)

 * pmctl: use model API for env-set/env-unset (Ryan Graham)

 * test: add wait to async test helper (Ryan Graham)

 * test: improve debugging of pmctl tests (Ryan Graham)

 * test: make async tests more resilient (Ryan Graham)

 * pm-install: fix debug message going to stderr (Ryan Graham)

 * test: fix typo in docker test (Ryan Graham)

 * test: make vagrant and docker tests safer (Ryan Graham)

 * test: make vagrant vm easier to manipulate (Ryan Graham)

 * test: simplify pmctl-log tests (Ryan Graham)

 * server: Use/expose env provided by Service model (Ryan Graham)

 * server: initialize environment store earlier (Ryan Graham)

 * Send reply back to client before shutdown (Krishna Raman)

 * pmctl: refactor to use strong-url-defaults (Sam Roberts)

 * package: correct typo in lint script (Sam Roberts)

 * package: correct license link (Sam Roberts)

 * pm: listen port defaults to 8701 (Sam Roberts)

 * pm-install: wrap usage to 80 columns and punctuate (Sam Roberts)

 * pm: remove duplicate check for parent-death (Sam Roberts)

 * lint: add the index.js (Sam Roberts)

 * require strong-mesh-models@4 after model refactor (Ryan Graham)

 * Fix metadata test to test properties of non-stopped processes (Krishna Raman)

 * Move handling of fork notification (Krishna Raman)

 * Move handling of started notification (Krishna Raman)

 * Move handling of exit notification (Krishna Raman)

 * Collect additional data for events (Krishna Raman)

 * Move handling of express:usage-record notification (Krishna Raman)

 * Move handling of profile notifications (Krishna Raman)

 * Move handling of agent:trace notification (Krishna Raman)

 * Move handling of metrics notification (Krishna Raman)

 * Move handling of listening notification (Krishna Raman)

 * Rename express usage metric fields (Krishna Raman)

 * Modify to use server and models from mesh-models (Krishna Raman)

 * Move models, boot scripts & config to mesh-models (Krishna Raman)

 * package: passes `npm run lint` (Sam Roberts)

 * test: add wiggle room to pmctl log tests (Ryan Graham)

 * package: add eslint and jscs scripts (Sam Roberts)

 * fix exclusive tmpdir assumption (Ryan Graham)

 * Fix broken sendError in tgz pack receiver (Ryan Graham)

 * pmctl: support http+ssh:// for using http over ssh (Ryan Graham)

 * test: fix broken pmctl environment (Ryan Graham)

 * test: use official version of tap (Ryan Graham)

 * install: don't always chown -r the basedir (Ryan Graham)

 * install: replace chown loop with chownr module (Ryan Graham)

 * install: extract uid/gid lookup step (Ryan Graham)

 * install: use HOME as pm's basedir (Ryan Graham)

 * Expose http trace data via PM API (Krishna Raman)

 * Expose "ExpressUsageRecord" (Miroslav Bajtoš)

 * test: clear sl-pm.docker.cid file before test (Ryan Graham)

 * test: bump test timeout (Ryan Graham)

 * test: constrain docker tests to cluster=1 (Ryan Graham)

 * Remove internal references to config file (Ryan Graham)

 * config: remove config file loading and ini support (Ryan Graham)

 * Remove config file support from all commands (Ryan Graham)

 * Bump major for upcoming breaking changes (Ryan Graham)

 * test: split pmctl tests into smaller tests (Ryan Graham)


2015-02-10, Version 1.7.2
=========================

 * install: remove duplicate error message (Ryan Graham)


2015-02-08, Version 1.7.1
=========================

 * Use process pid when filtering for model updates (Krishna Raman)


2015-01-29, Version 1.7.0
=========================

 * fix 'pmctl log-dump --follow' option parsing (Ryan Graham)

 * test: use queued async helper for pmctl-local (Ryan Graham)

 * test: make helper-async fully async (Ryan Graham)

 * feature: pmctl log-dump command to dump logs (Ryan Graham)

 * feature: store recent log entries in memory (Ryan Graham)

 * test: use mktmpdir in pm tests (Ryan Graham)

 * docs: update command usage text (Ryan Graham)

 * test: add additional git push tests (Ryan Graham)

 * Add support for HTTP authentication (Ryan Graham)

 * Fix metrics process id assignment (Krishna Raman)


2015-01-21, Version 1.6.0
=========================

 * Revert "Merge pull request #94 from strongloop/feature/scheduler_related" (Krishna Raman)

 * test: specify order to match expected result (Ryan Graham)

 * test: rewrote pmctl-local to not use shelljs (Sam Roberts)

 * Bump major version (Krishna Raman)

 * Move profile download endpoint to ServiceInstance (Krishna Raman)

 * Associate metrics models with ServiceInstance (Krishna Raman)

 * Associate ProfileData with targeted Process model (Krishna Raman)

 * Initialize models with ID from environment (Krishna Raman)

 * Use unique InstanceAction string id (Krishna Raman)

 * Update models when env is set/unset (Krishna Raman)

 * Update version to reflect new one-shot feature (Sam Roberts)

 * deps: switch to strong-fork-cicada (Ryan Graham)

 * pm: env can define the initial cluster size (Sam Roberts)

 * test: improve traceability of pmctl tests (Sam Roberts)

 * pmctl: fix punctuation and grammar in usage text (Sam Roberts)

 * pmctl: remove stray log of control path (Sam Roberts)

 * pmctl: reorganize long form usage (Sam Roberts)

 * pmctl: add timeout argument to cpu-start (Sam Roberts)

 * Rename help text files to <cmd>.txt (Sam Roberts)

 * Fix bad CLA URL in CONTRIBUTING.md (Ryan Graham)

 * Add pmctl support for watchdog timeout (Krishna Raman)

 * Fix mesh model resolution to use module name (Krishna Raman)


2014-12-15, Version 1.5.1
=========================

 * run: metrics triggers log msg every 15 secs (Sam Roberts)


2014-12-15, Version 1.5.0
=========================

 * Support sl-run spawn on Windows (Sam Roberts)


2014-12-09, Version 1.4.2
=========================

 * Add Dockerfile for Docker Hub automated build (Ryan Graham)

 * debug: don't put process.env into the commits (Sam Roberts)

 * debug: don't warn on absence of config file (Sam Roberts)

 * debug: fix debug output suggesting process leaks (Sam Roberts)

 * debug: log the info that triggered an update (Sam Roberts)


2014-12-09, Version 1.4.1
=========================

 * locked mode: reject all deployment attempts (Ryan Graham)

 * test: refactor docker e2e test script (Ryan Graham)

 * Fix deploy after current app is stopped (Sam Roberts)

 * run: improve log messages about actions and state (Sam Roberts)

 * Don't report supervisor "status" msg as unknown (Sam Roberts)

 * Fix confusing debug output about current deploy (Sam Roberts)

 * package: use debug v2.x in all strongloop deps (Sam Roberts)


2014-12-05, Version 1.4.0
=========================

 * Delete metrics older than 5 min on metrics update (Sam Roberts)

 * Use compression directly (Ritchie Martori)

 * Add ability to set cluster size for start/deploy (Krishna Raman)

 * Update instance state upon start/stop (Krishna Raman)

 * package: update strong-build dev-dep to ^1.x (Sam Roberts)

 * deploy: deploy local directory and run it in place (Krishna Raman)

 * test: fix systemd service installation test (Ryan Graham)

 * test: skip docker tests if docker is misconfigured (Ryan Graham)

 * Update TODO (Sam Roberts)

 * Don't create new router for / (Ryan Graham)

 * inherit host registry in test VM and container (Ryan Graham)

 * test: Add Docker based e2e tests (Ryan Graham)

 * Bubble supervisor events to parent (Krishna Raman)

 * Add additional service and instance metadata (Krishna Raman)

 * Receive live metrics and update in-memory models (Sam Roberts)

 * pm: implement fake metrics generation (Sam Roberts)

 * model: executor, instance, process, metric exposed (Sam Roberts)

 * server: ServiceProcess processId rename to pid (Sam Roberts)

 * gen-angular-sdk: a script to generate the SDK (seanbrookes)

 * fix: use init specific default job-file (Ryan Graham)

 * Fix invalid debug statement (Krishna Raman)

 * Document systemd/Upstart support (Ryan Graham)

 * pm: exit on parent ipc disconnect (Sam Roberts)

 * Support installing strong-pm as a systemd service (Ryan Graham)

 * package: document control endpoint (Sam Roberts)

 * docs: update command usage sections (Ryan Graham)

 * internal: use persisted environment for --metrics (Ryan Graham)

 * install: add --set-env/-e for initial app env (Ryan Graham)

 * internal: extract sl-pm-usage to usage file (Ryan Graham)

 * install: Recursively set ownership of baseDir (Ryan Graham)

 * Use released version of loopback-explorer (Ryan Graham)

 * pmctl: Add env-unset to remove configured env vars (Ryan Graham)

 * pmctl: Add env-get to get configured app env vars (Ryan Graham)

 * pmctl: Add env-set to configure app env vars (Ryan Graham)

 * Store/load persisted environments for applications (Ryan Graham)

 * don't copy /etc/skel in service installation (Ryan Graham)

 * test: Upgrade node in Vagrant test VM (Ryan Graham)


2014-11-05, Version 1.3.1
=========================

 * Use released version of loopback-explorer (Ryan Graham)


2014-11-03, Version 1.3.0
=========================

 * Don't crash on runner exit after soft-stop (Ryan Graham)

 * models: fix instance.processes update (Sam Roberts)

 * test: cpu profiling now supported on v0.10 (Sam Roberts)

 * Fix no-such-file test (Ryan Graham)

 * Add LB API for remote control using pmctl (Krishna Raman)

 * test: execPath and which node are not the same (Sam Roberts)

 * Add --metrics option to pm-install (Ryan Graham)

 * Upgrade strong-service-install to 1.0.0 (Ryan Graham)

 * Refactor install options to avoid duplication (Ryan Graham)

 * Always chown basedir (Ryan Graham)

 * Update contribution guidelines (Ryan Graham)


2014-09-29, Version 1.2.0
=========================

 * package: mention license in README (Sam Roberts)

 * Enable strong-pm to be controlled from parent (Krishna Raman)

 * package: npm ls requires supervisor after 1.0.0 (Sam Roberts)

 * test: remove executable bit from test-pmctl.js (Sam Roberts)

 * package: add keywords (Sam Roberts)


2014-09-08, Version 1.1.0
=========================

 * pmctl: add npm-ls-alike command (Sam Roberts)


2014-09-02, Version 1.0.0
=========================

 * package: document the files config section (Sam Roberts)

 * package: update pm-install usage in README (Sam Roberts)

 * package: add keywords for npm search (Sam Roberts)

 * package: document usage and configuration (Sam Roberts)

 * pmctl: fix missing argument --config in usage (Sam Roberts)

 * test: objects-start/stop doesn't work without a license (Sam Roberts)

 * test: don't pipe stdout, or collect stderr (Sam Roberts)

 * test: update strong-build to 0.2.x (Sam Roberts)

 * deps: update to strong-supervisor@0.3.3 (Ryan Graham)

 * pmctl: add a control CLI to pm and supervisor (Sam Roberts)

 * Revert "pmctl: add a control CLI to pm and supervisor" (Ryan Graham)


2014-08-26, Version 0.1.9
=========================

 * Use upstream passwd-user (Ryan Graham)

 * pm: exit on loss of parent IPC channel (Sam Roberts)

 * package: sync package name with README (Sam Roberts)

 * test: rewrite comments referring to strong-deploy (Sam Roberts)

 * pm-install: strong-deploy is now called strong-pm (Sam Roberts)

 * deploy: Add tarball over HTTP deploy support (Krishna Raman)


2014-08-12, Version 0.1.8
=========================



2014-08-06, Version 0.1.7
=========================

 * Rename strong-cli to strongloop (Krishna Raman)

 * Add strong-pm's dependencies' bins to PATH (Ryan Graham)

 * test: Allow standalone Vagrantfile usage (Ryan Graham)


2014-07-29, Version 0.1.6
=========================



2014-07-29, Version 0.1.5
=========================

 * bundle forked dependency: passwd-user (Ryan Graham)


2014-07-21, Version 0.1.4
=========================

 * Update README (Sam Roberts)

 * Use .gitignore, not .npmignore (Sam Roberts)


2014-07-21, Version 0.1.3
=========================

 * Npm ignore .strong* temporary files (Sam Roberts)


2014-07-21, Version 0.1.2
=========================

 * install: Improve --help output (Ryan Graham)

 * install: Add support for Upstart 0.6 (Ryan Graham)

 * Update strong-supervisor dependency to 0.3.0 (Sam Roberts)


2014-07-21, Version 0.1.0
=========================

 * Add sl-pm-install command (Ryan Graham)

 * test: Turn test app into echo server (Ryan Graham)

 * test: Allow mix of js and sh based tests (Ryan Graham)

 * test: Specify git author (Ryan Graham)

 * test: Don't require sl-pm in path (Ryan Graham)

 * Apply dual Artistic/StrongLoop license (Sam Roberts)

 * Rename strong-deploy to strong-pm (Krishna Raman)

 * package: sort and remove unused cluster-control (Sam Roberts)

 * Restart current deployment when strong-pm starts (Krishna Raman)

 * Add branch names to git push command (Krishna Raman)

 * Move async to dependency instead of dev-dependency (Krishna Raman)

 * test: temporary test fix while waiting for sl-run (Sam Roberts)

 * test: align app exit status with strong-supervisor (Sam Roberts)

 * run: default to using clustering, so reload works (Sam Roberts)

 * test: note that tests can run much faster than they are (Sam Roberts)

 * bin: rename sl-deploy to sl-deploy.js (Sam Roberts)

 * test: use git commit, git ci is my local alias (Sam Roberts)

 * package: depends on sl-build for tests (Sam Roberts)

 * run: implement restart-in-place (Sam Roberts)

 * test: add registry to test app package (Sam Roberts)

 * run: refactor linking into a runner method (Sam Roberts)

 * run: refactor in preparation for restart in place (Sam Roberts)

 * test: test start, restart, stop behaviour (Sam Roberts)

 * config: don't console.error when config file is "" (Sam Roberts)

 * run: expose current runner, and callback on stop (Sam Roberts)

 * test: style change of comments and logs messages (Sam Roberts)

 * test: describe failure reason on premature exit (Sam Roberts)

 * run: symlink to the working dir, and set PWD (Sam Roberts)

 * readme: add quick-start section (Sam Roberts)

 * Refactor index.js reflecting mandatory listen port (Sam Roberts)

 * config: support adding files during prepare (Sam Roberts)

 * readme: start of docs for config file syntax (Sam Roberts)

 * main: stop children when signalled (Sam Roberts)

 * run: configurable start command (Sam Roberts)

 * run: configurable stop signal (Sam Roberts)

 * test: start and stop tests (Sam Roberts)

 * test: app reports SIGINT/TERM/HUP (Sam Roberts)

 * test: avoid node confusion over entrypoint (Sam Roberts)

 * gitignore npm-debug.log (Sam Roberts)

 * package: deployer uses strong-supervisor internally (Sam Roberts)

 * receive: test git receive against test/app (Sam Roberts)

 * test: simple http server test application (Sam Roberts)

 * prepare: configurable commands to prepare app (Sam Roberts)

 * refactor: split receive into receive,prepare (Sam Roberts)

 * config: support configuration from file and argv (Sam Roberts)

 * refactor: listen, app renamed to receive, run (Sam Roberts)

 * run: start and stop a pushed app after prepare (Sam Roberts)

 * readme: architecture diagram (Sam Roberts)

 * listen: receive git push, and prepare to run (Sam Roberts)

 * usage: help and version commands (Sam Roberts)

 * package: basic npm package structure (Sam Roberts)


2014-06-03, Version INITIAL
===========================

 * First release!
