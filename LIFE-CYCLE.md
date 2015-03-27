## Life-cycle

The process manager is responsible for receiving packaged applications,
preparing them to be run, and then running them under supervision (clustered,
with run-time profiling and metrics support, restart on failure, etc.).

The prepare commands used are:

- `npm rebuild`
- `npm install --production`

Since `npm install` is called, the preparation may be customized using npm
install and pre-install scripts, if necessary.

After preparation, the application is run.
