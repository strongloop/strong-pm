// Copyright IBM Corp. 2015. All Rights Reserved.
// Node module: strong-pm
// This file is licensed under the Artistic License 2.0.
// License text available at https://opensource.org/licenses/Artistic-2.0

'use strict';

var helper = require('./helper-pmctl');

helper.test('pmctl', function(t, pm) {
  var pmctl = pm.pmctlFn;

  t.waiton(pmctl('status'), /Processes:$/m);

  t.test('app dependencies', function(t) {
    t.expect(pmctl('npmls', '1'), /test-app@/);
  });

  t.shutdown(pm);
});
