console.log('not ok # TODO implement Digest auth support in pmctl');

// TODO: In order to use Digest auth across the board, the pmctl CLI must
// support Digest auth for all actions. Currently actions that involve
// downloading a file make use of http.request, which does not support Digest
// auth.
