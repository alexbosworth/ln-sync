const {deepEqual} = require('node:assert').strict;
const test = require('node:test');
const {throws} = require('node:assert').strict;
const {transactionFromComponents} = require('@alexbosworth/blockchain');

const method = require('./../../funding/is_encoded_transaction');

const emptyTransaction = transactionFromComponents({
  inputs: [],
  locktime: 0,
  outputs: [],
  version: 1,
});

const tests = [
  {
    args: {input: emptyTransaction.transaction},
    description: 'A hex transaction is an encoded tx',
    expected: {is_transaction: true},
  },
  {
    args: {input: emptyTransaction.transaction.toUpperCase()},
    description: 'An uppercase hex transaction is an encoded tx',
    expected: {is_transaction: true},
  },
  {
    args: {input: emptyTransaction.transaction + '00'},
    description: 'A transaction with trailing data is not a transaction',
    expected: {is_transaction: false},
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
