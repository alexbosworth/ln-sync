const {deepEqual} = require('node:assert').strict;
const test = require('node:test');
const {throws} = require('node:assert').strict;
const {Transaction} = require('bitcoinjs-lib');

const method = require('./../../funding/is_encoded_transaction');

const tests = [
  {
    args: {input: new Transaction().toHex()},
    description: 'A hex transaction is an encoded tx',
    expected: {is_transaction: true},
  },
  {
    args: {input: 'invalid transaction'},
    description: 'A non-tx string is not a transaction',
    expected: {is_transaction: false},
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
