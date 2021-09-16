const {Transaction} = require('bitcoinjs-lib');
const {test} = require('@alexbosworth/tap');

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
  return test(description, ({end, strictSame}) => {
    const res = transactionRecords(args);

    strictSame(res, expected, 'Got expected result');

    return end();
  });
});
