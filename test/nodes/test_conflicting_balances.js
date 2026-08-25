const {deepEqual} = require('node:assert').strict;
const test = require('node:test');
const {idForTransaction} = require('@alexbosworth/blockchain');
const {transactionFromComponents} = require('@alexbosworth/blockchain');

const conflictingBalances = require('./../../nodes/conflicting_balances');

const idForTx = transaction => idForTransaction({transaction}).id;

const makeTransaction = ({id, tokens}) => transactionFromComponents({
  inputs: [{id, script: '', sequence: 0, vout: 0}],
  locktime: 0,
  outputs: [{script: '0014' + '11'.repeat(20), tokens}],
  version: 1,
}).transaction;

// Two unconfirmed transactions spending the same outpoint conflict
const spendA = makeTransaction({id: 'ee'.repeat(32), tokens: 1000});
const spendB = makeTransaction({id: 'ee'.repeat(32), tokens: 2000});

// An unconfirmed transaction spending a confirmed spent outpoint is invalid
const spendC = makeTransaction({id: 'ff'.repeat(32), tokens: 3000});
const spendD = makeTransaction({id: 'ff'.repeat(32), tokens: 4000});

const tests = [
  {
    args: {
      transactions: [
        {id: idForTx(spendA), is_confirmed: false, transaction: spendA},
        {id: idForTx(spendB), is_confirmed: false, transaction: spendB},
      ],
      utxos: [
        {confirmation_count: 0, tokens: 1000, transaction_id: idForTx(spendA)},
        {confirmation_count: 0, tokens: 2000, transaction_id: idForTx(spendB)},
      ],
    },
    description: 'Unconfirmed spends of the same outpoint are conflicting',
    expected: {
      conflicting_pending_balance: 2000,
      invalid_pending_balance: 0,
    },
  },
  {
    args: {
      transactions: [
        {id: idForTx(spendC), is_confirmed: true, transaction: spendC},
        {id: idForTx(spendD), is_confirmed: false, transaction: spendD},
      ],
      utxos: [
        {confirmation_count: 0, tokens: 4000, transaction_id: idForTx(spendD)},
      ],
    },
    description: 'Unconfirmed spends of confirmed spent outpoints are invalid',
    expected: {
      conflicting_pending_balance: 0,
      invalid_pending_balance: 4000,
    },
  },
  {
    args: {
      transactions: [
        {id: idForTx(spendA), is_confirmed: false, transaction: spendA},
        {id: idForTx(spendB), is_confirmed: false, transaction: spendB},
        {id: idForTx(spendC), is_confirmed: true, transaction: spendC},
        {
          id: idForTx(makeTransaction({id: 'ee'.repeat(32), tokens: 5000})),
          is_confirmed: true,
          transaction: makeTransaction({id: 'ee'.repeat(32), tokens: 5000}),
        },
      ],
      utxos: [
        {confirmation_count: 0, tokens: 1000, transaction_id: idForTx(spendA)},
        {confirmation_count: 0, tokens: 2000, transaction_id: idForTx(spendB)},
      ],
    },
    description: 'A confirmed conflict makes conflicting spends invalid',
    expected: {
      conflicting_pending_balance: 0,
      invalid_pending_balance: 3000,
    },
  },
  {
    args: {
      transactions: [
        {id: idForTx(spendA), is_confirmed: false},
        {id: idForTx(spendC), is_confirmed: true},
        {id: idForTx(spendD), is_confirmed: false, transaction: spendD},
        {id: idForTx(spendB), is_confirmed: true, transaction: spendB},
      ],
      utxos: [
        {confirmation_count: 1, tokens: 1000, transaction_id: idForTx(spendA)},
        {confirmation_count: 0, tokens: 2000, transaction_id: idForTx(spendA)},
        {confirmation_count: 0, tokens: 3000, transaction_id: 'unknown'},
      ],
    },
    description: 'Unknown and confirmed transactions are not conflicts',
    expected: {
      conflicting_pending_balance: 0,
      invalid_pending_balance: 0,
    },
  },
];

tests.forEach(({args, description, expected}) => {
  return test(description, (t, end) => {
    const res = conflictingBalances(args);

    deepEqual(res, expected, 'Got expected result');

    return end();
  });
});
