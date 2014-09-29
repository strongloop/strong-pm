2014-09-29, Version 1.2.0
=========================

 * package: mention license in README (Sam Roberts)

 * Enable strong-pm to be controlled from parent (Krishna Raman)

 * package: npm ls requires supervisor after 1.0.0 (Sam Roberts)

 * test: remove executable bit from test-pmctl.js (Sam Roberts)

 * package: add keywords (Sam Roberts)


2014-09-05, Version 1.1.0
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

 * pmctl: add a control CLI to pm and supervisor (Sam Roberts)


2014-08-26, Version v0.1.9
==========================

 * Use upstream passwd-user (Ryan Graham)

 * pm: exit on loss of parent IPC channel (Sam Roberts)

 * package: sync package name with README (Sam Roberts)

 * test: rewrite comments referring to strong-deploy (Sam Roberts)

 * pm-install: strong-deploy is now called strong-pm (Sam Roberts)

 * deploy: Add tarball over HTTP deploy support (Krishna Raman)


2014-08-12, Version v0.1.8
==========================



2014-08-06, Version v0.1.7
==========================

 * Rename strong-cli to strongloop (Krishna Raman)

 * Add strong-pm's dependencies' bins to PATH (Ryan Graham)

 * test: Allow standalone Vagrantfile usage (Ryan Graham)


2014-07-29, Version v0.1.6
==========================



2014-07-29, Version v0.1.5
==========================

 * bundle forked dependency: passwd-user (Ryan Graham)


2014-07-21, Version v0.1.4
==========================

 * Update README (Sam Roberts)

 * Use .gitignore, not .npmignore (Sam Roberts)


2014-07-21, Version v0.1.3
==========================

 * Npm ignore .strong* temporary files (Sam Roberts)


2014-07-21, Version v0.1.2
==========================

 * install: Improve --help output (Ryan Graham)

 * install: Add support for Upstart 0.6 (Ryan Graham)

 * Update strong-supervisor dependency to 0.3.0 (Sam Roberts)


2014-07-21, Version v0.1.0
==========================

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
