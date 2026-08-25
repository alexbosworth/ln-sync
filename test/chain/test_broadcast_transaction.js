const EventEmitter = require('node:events');
const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');
const {transactionFromComponents} = require('@alexbosworth/blockchain');

const {makeLnd} = require('mock-lnd');

const method = require('./../../chain/broadcast_transaction');

const makeTransaction = ({locktime, sequence}) => transactionFromComponents({
  locktime,
  inputs: [{sequence, id: 'ab'.repeat(32), script: '', vout: 0}],
  outputs: [{script: '0014' + '11'.repeat(20), tokens: 500}],
  version: 1,
}).transaction;

// A transaction with max sequence inputs ignores its timelock
const maxSequenceTx = makeTransaction({locktime: 3, sequence: 0xffffffff});

// A transaction with a block height timelock waits for that height
const timelockedTx = makeTransaction({locktime: 3, sequence: 0});

// A transaction with a time based timelock does not wait for a height
const timeLockedTx = makeTransaction({locktime: 500000000, sequence: 0});

// A transaction with a past height timelock does not wait
const pastLockedTx = makeTransaction({locktime: 1, sequence: 0});

const makeBroadcastLnd = overrides => {
  const lnd = makeLnd({});

  let call = 0;

  lnd.chain.registerBlockEpochNtfn = ({}) => {
    const script = (overrides.blocks || [])[call++] || [];
    const sub = new EventEmitter();

    sub.cancel = () => {};

    script.forEach((event, i) => {
      setTimeout(() => {
        // Exit early when the subscription should emit an error
        if (event === 'error') {
          return sub.emit('error', new Error('BlocksSubscriptionFailed'));
        }

        return sub.emit('data', {hash: Buffer.alloc(32), height: event});
      },
      1 + i * 10);
    });

    return sub;
  };

  lnd.chain.registerConfirmationsNtfn = ({}) => {
    const sub = new EventEmitter();

    sub.cancel = () => {};

    (overrides.confirmations || []).forEach((event, i) => {
      setTimeout(() => {
        // Exit early when the subscription should emit an error
        if (event === 'error') {
          return sub.emit('error', new Error('ConfSubscriptionFailed'));
        }

        return sub.emit('data', {
          conf: {
            block_hash: Buffer.alloc(32, 1),
            block_height: event,
            raw_tx: Buffer.from(maxSequenceTx, 'hex'),
          },
        });
      },
      15 + i * 10);
    });

    return sub;
  };

  lnd.wallet.publishTransaction = ({}, cbk) => {
    // Exit early when publishing the transaction should fail
    if (!!overrides.is_publish_failing) {
      return cbk({message: 'PublishFailed'});
    }

    return setTimeout(() => cbk(null, {}), overrides.publish_delay_ms || 1);
  };

  return lnd;
};

const makeArgs = overrides => {
  const args = {
    lnd: makeBroadcastLnd({blocks: [[1], [2]], confirmations: [700]}),
    logger: {info: () => {}},
    transaction: maxSequenceTx,
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const tests = [
  {
    args: makeArgs({lnd: undefined}),
    description: 'An lnd object is required to broadcast a transaction',
    error: [400, 'ExpectedLndToBroadcastTransaction'],
  },
  {
    args: makeArgs({logger: undefined}),
    description: 'A logger is required to broadcast a transaction',
    error: [400, 'ExpectedLoggerToBroadcastTransaction'],
  },
  {
    args: makeArgs({transaction: 'zz'}),
    description: 'A hex transaction is required to broadcast a transaction',
    error: [400, 'ExpectedHexEncodedSignedTransactionToBroadcast'],
  },
  {
    args: makeArgs({transaction: '0001'}),
    description: 'A valid transaction is required to broadcast',
    error: [400, 'ExpectedSignedTransactionToBroadcast'],
  },
  {
    args: makeArgs({}),
    description: 'A transaction is broadcast until it is confirmed',
    expected: {transaction_confirmed_in_block: 700},
  },
  {
    args: makeArgs({
      lnd: makeBroadcastLnd({
        blocks: [[1], [2, 3], [4]],
        confirmations: [700],
      }),
      transaction: timelockedTx,
    }),
    description: 'A timelocked transaction waits for the locktime height',
    expected: {transaction_confirmed_in_block: 700},
  },
  {
    args: makeArgs({
      lnd: makeBroadcastLnd({blocks: [[1], [2]], confirmations: [700]}),
      transaction: timeLockedTx,
    }),
    description: 'A time based timelock does not wait for a block height',
    expected: {transaction_confirmed_in_block: 700},
  },
  {
    args: makeArgs({
      lnd: makeBroadcastLnd({blocks: [[1], [2]], confirmations: [700]}),
      transaction: pastLockedTx,
    }),
    description: 'A past height timelock does not wait for a block height',
    expected: {transaction_confirmed_in_block: 700},
  },
  {
    args: makeArgs({
      lnd: makeBroadcastLnd({blocks: [[1], ['error']]}),
      transaction: timelockedTx,
    }),
    description: 'A blocks subscription error stops waiting for locktime',
    error: [503, 'UnexpectedErrorSubscribingToBlocks'],
  },
  {
    args: makeArgs({
      lnd: makeBroadcastLnd({blocks: [[1], ['error']]}),
    }),
    description: 'A blocks subscription error stops the broadcast',
    error: [503, 'UnexpectedErrorBroadcastingTransaction'],
  },
  {
    args: makeArgs({
      lnd: makeBroadcastLnd({blocks: [[1], [2]], confirmations: ['error']}),
    }),
    description: 'A confirmations subscription error stops the broadcast',
    error: [503, 'UnexpectedErrorBroadcastingTransaction'],
  },
  {
    args: makeArgs({
      lnd: makeBroadcastLnd({
        blocks: [[1], [2]],
        confirmations: [700],
        is_publish_failing: true,
      }),
    }),
    description: 'A broadcast failure stops the broadcast',
    error: [503, 'UnexpectedErrorBroadcastingTransaction'],
  },
  {
    args: makeArgs({
      lnd: makeBroadcastLnd({
        blocks: [[1], [2]],
        confirmations: [700],
        publish_delay_ms: 40,
      }),
    }),
    description: 'A confirmation while broadcasting stops rebroadcasting',
    expected: {transaction_confirmed_in_block: 700},
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    if (!!error) {
      await rejects(method(args), error, 'Got expected error');
    } else {
      const res = await method(args);

      deepEqual(res, expected, 'Got expected result');
    }

    // Wait for any stray broadcast events to settle
    await new Promise(resolve => setTimeout(resolve, 60));

    return;
  });
});
