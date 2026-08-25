const {deepEqual} = require('node:assert').strict;
const test = require('node:test');
const {idForTransaction} = require('@alexbosworth/blockchain');
const {transactionFromComponents} = require('@alexbosworth/blockchain');

const transactionRecords = require('./../../chain/transaction_records');

const idForTx = transaction => idForTransaction({transaction}).id;

const makeTransaction = ids => transactionFromComponents({
  inputs: ids.map(id => ({id, script: '', sequence: 0, vout: 0})),
  locktime: 0,
  outputs: [{script: '0014' + '11'.repeat(20), tokens: 500}],
  version: 1,
}).transaction;

// A chain of transactions: close is swept by grand, spent on to original
const closeTransaction = makeTransaction(['aa'.repeat(32)]);
const grandTransaction = makeTransaction([idForTx(closeTransaction)]);
const originalTransaction = makeTransaction([idForTx(grandTransaction)]);
const spendTransaction = makeTransaction([idForTx(originalTransaction)]);

const chainTransactions = [
  {id: idForTx(closeTransaction), transaction: closeTransaction},
  {id: idForTx(grandTransaction), transaction: grandTransaction},
  {id: idForTx(originalTransaction), transaction: originalTransaction},
  {id: idForTx(spendTransaction), transaction: spendTransaction},
];

const makeArgs = overrides => {
  const args = {
    ended: [],
    id: idForTx(spendTransaction),
    original: idForTx(originalTransaction),
    pending: [],
    txs: [],
    vout: 0,
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const makeEnded = overrides => {
  const chan = {
    capacity: 1000000,
    close_transaction_id: undefined,
    final_local_balance: 10,
    final_time_locked_balance: 20,
    id: '0x0x0',
    is_cooperative_close: false,
    is_local_force_close: false,
    is_remote_force_close: false,
    partner_public_key: 'partner',
    transaction_id: 'aa'.repeat(32),
    transaction_vout: 0,
  };

  Object.keys(overrides).forEach(k => chan[k] = overrides[k]);

  return chan;
};

const tests = [
  {
    args: makeArgs({}),
    description: 'Transaction records are mapped to contextual records',
    expected: {records: []},
  },
  {
    args: makeArgs({
      pending: [
        {
          is_closing: true,
          partner_public_key: 'a',
          pending_balance: 1,
          timelock_expiration: 2,
          transaction_id: idForTx(spendTransaction),
          transaction_vout: 0,
        },
        {
          is_closing: true,
          partner_public_key: 'b',
          pending_balance: 3,
          timelock_expiration: 4,
          transaction_id: idForTx(spendTransaction),
          transaction_vout: 1,
        },
        {
          is_closing: false,
          partner_public_key: 'c',
          transaction_id: idForTx(spendTransaction),
          transaction_vout: 0,
        },
      ],
    }),
    description: 'A spend of a pending closing channel is a closing record',
    expected: {
      records: [{
        action: 'channel_closing',
        balance: 1,
        timelock: 2,
        with: 'a',
      }],
    },
  },
  {
    args: makeArgs({
      pending: [{
        close_transaction_id: idForTx(spendTransaction),
        is_partner_initiated: true,
        partner_public_key: 'b',
        pending_balance: 3,
        timelock_expiration: 4,
        transaction_id: 'bb'.repeat(32),
        transaction_vout: 0,
      }],
    }),
    description: 'A peer initiated closing tx is a peer force closing record',
    expected: {
      records: [{
        action: 'peer_force_closing_channel',
        balance: 3,
        timelock: 4,
        with: 'b',
      }],
    },
  },
  {
    args: makeArgs({
      pending: [{
        close_transaction_id: idForTx(spendTransaction),
        is_partner_initiated: false,
        partner_public_key: 'b',
        transaction_id: 'bb'.repeat(32),
        transaction_vout: 0,
      }],
    }),
    description: 'A self initiated closing tx is not a peer force close',
    expected: {records: []},
  },
  {
    args: makeArgs({
      ended: [makeEnded({
        close_transaction_id: idForTx(closeTransaction),
        is_local_force_close: true,
      })],
      txs: chainTransactions,
    }),
    description: 'A sweep of a force close is a force closed channel record',
    expected: {
      records: [{
        action: 'force_closed_channel',
        balance: 20,
        capacity: 1000000,
        channel: '0x0x0',
        close_tx: idForTx(closeTransaction),
        open_tx: 'aa'.repeat(32),
        with: 'partner',
      }],
    },
  },
  {
    args: makeArgs({
      ended: [makeEnded({
        close_transaction_id: idForTx(closeTransaction),
        is_local_force_close: false,
      })],
      txs: chainTransactions,
    }),
    description: 'A sweep of a non force close has no force close record',
    expected: {records: []},
  },
  {
    args: makeArgs({
      ended: [makeEnded({
        close_transaction_id: idForTx(closeTransaction),
        is_local_force_close: true,
      })],
      txs: chainTransactions.filter(n => n.id !== idForTx(originalTransaction)),
    }),
    description: 'A missing original transaction stops the sweep search',
    expected: {records: []},
  },
  {
    args: makeArgs({
      ended: [makeEnded({
        close_transaction_id: idForTx(closeTransaction),
        is_local_force_close: true,
      })],
      txs: chainTransactions.filter(n => n.id !== idForTx(grandTransaction)),
    }),
    description: 'A missing swept transaction stops the sweep search',
    expected: {records: []},
  },
  {
    args: makeArgs({
      ended: [makeEnded({
        close_transaction_id: idForTx(spendTransaction),
        is_cooperative_close: true,
      })],
    }),
    description: 'A cooperative close tx is a cooperative close record',
    expected: {
      records: [{
        action: 'cooperatively_closed_channel',
        balance: 10,
        capacity: 1000000,
        channel: '0x0x0',
        close_tx: idForTx(spendTransaction),
        open_tx: 'aa'.repeat(32),
        with: 'partner',
      }],
    },
  },
  {
    args: makeArgs({
      ended: [makeEnded({
        close_transaction_id: idForTx(spendTransaction),
        is_local_force_close: true,
      })],
    }),
    description: 'A local force close tx is a force close record',
    expected: {
      records: [{
        action: 'force_closed_channel',
        balance: 20,
        capacity: 1000000,
        channel: '0x0x0',
        close_tx: idForTx(spendTransaction),
        open_tx: 'aa'.repeat(32),
        with: 'partner',
      }],
    },
  },
  {
    args: makeArgs({
      ended: [makeEnded({
        close_transaction_id: idForTx(spendTransaction),
        final_time_locked_balance: 0,
        is_local_force_close: true,
      })],
    }),
    description: 'A force close without timelocked funds uses local balance',
    expected: {
      records: [{
        action: 'force_closed_channel',
        balance: 10,
        capacity: 1000000,
        channel: '0x0x0',
        close_tx: idForTx(spendTransaction),
        open_tx: 'aa'.repeat(32),
        with: 'partner',
      }],
    },
  },
  {
    args: makeArgs({
      ended: [makeEnded({
        close_transaction_id: idForTx(spendTransaction),
        is_remote_force_close: true,
      })],
    }),
    description: 'A remote force close tx is a peer force close record',
    expected: {
      records: [{
        action: 'peer_force_closed_channel',
        balance: 10,
        capacity: 1000000,
        channel: '0x0x0',
        close_tx: idForTx(spendTransaction),
        open_tx: 'aa'.repeat(32),
        with: 'partner',
      }],
    },
  },
];

tests.forEach(({args, description, expected}) => {
  return test(description, (t, end) => {
    const res = transactionRecords(args);

    deepEqual(res, expected, 'Got expected result');

    return end();
  });
});
