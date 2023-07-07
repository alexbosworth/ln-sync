const {deepEqual} = require('node:assert').strict;
const test = require('node:test');
const {Transaction} = require('bitcoinjs-lib');

const transactionRecords = require('./../../chain/transaction_records');

const tests = [
  {
    args: {
      ended: [],
      id: (new Transaction()).getId(),
      original: (new Transaction()).toHex(),
      pending: [],
      txs: [],
      vout: 0,
    },
    description: 'Transaction records are mapped to contextual records',
    expected: {records: []},
  },
];

tests.forEach(({args, description, expected}) => {
  return test(description, (t, end) => {
    const res = transactionRecords(args);

    deepEqual(res, expected, 'Got expected result');

    return end();
  });
});
