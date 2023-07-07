const {deepEqual} = require('node:assert').strict;
const {throws} = require('node:assert').strict;
const test = require('node:test');

const method = require('./../../funding/is_base64_encoded');

const tests = [
  {
    args: {input: Buffer.alloc(10).toString('base64')},
    description: 'A buffer encoded as base64 is base64 encoded',
    expected: {is_base64: true},
  },
  {
    args: {input: 'invalid base64 input'},
    description: 'A buffer encoded as hex is not base64 encoded',
    expected: {is_base64: false},
  },
  {
    args: {},
    description: 'Nothing is not base64',
    expected: {is_base64: false},
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, (t, end) => {
    if (!!error) {
      throws(() => method(args), new Error(error), 'Error returned');
    } else {
      const got = method(args);

      deepEqual(got, expected, 'Got expected result');
    }

    return end();
  });
});
