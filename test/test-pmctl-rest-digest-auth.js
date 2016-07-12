// Copyright IBM Corp. 2015. All Rights Reserved.
// Node module: strong-pm
// This file is licensed under the Artistic License 2.0.
// License text available at https://opensource.org/licenses/Artistic-2.0

'use strict';

require('tap').test('pmctl with Digest auth', {
  todo: 'implement Digest auth support in pmctl',
});

// TODO: In order to use Digest auth across the board, the pmctl CLI must
// support Digest auth for all actions. Currently actions that involve
// downloading a file make use of http.request, which does not support Digest
// auth.
