'use strict';
// Copyright (c) 2012 Ecma International.  All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
es5id: 12.2.1-37-s
description: >
    'for(var arguments = 42 in ...) {...}' throws SyntaxError in
    strict mode
flags: [onlyStrict]
---*/


assert.throws(SyntaxError, function() {
    eval('for (var arguments = 42 in null) {};');
});

reportCompare(0, 0);
