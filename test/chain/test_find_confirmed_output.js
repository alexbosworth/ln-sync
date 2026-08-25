const EventEmitter = require('node:events');
const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const {makeLnd} = require('mock-lnd');

const method = require('./../../chain/find_confirmed_output');

const outputScript = '0014' + '55'.repeat(20);

// A transaction paying 5000 to the output script
const matchTransaction = '0100000001abababababababababababababababababababababababababababababababab000000000000000000018813000000000000160014555555555555555555555555555555555555555500000000';

// A coinbase transaction paying 5000 to the output script
const coinbaseTransaction = '01000000010000000000000000000000000000000000000000000000000000000000000000000000000000000000018813000000000000160014555555555555555555555555555555555555555500000000';

// A transaction paying 5000 to an unrelated output script
const missTransaction = '0100000001abababababababababababababababababababababababababababababababab000000000000000000018813000000000000160014565656565656565656565656565656565656565600000000';

const matchTransactionId = 'b6c528e1a9a7b315ac78ce26bd3c995af7d4e4b8678dd122047b0be0f9858279';
const coinbaseTransactionId = '130be2324d06f1b65bf356e6937d37de091198ff9fbd6d3ce5dbdd26c513c53f';

const makeChainLnd = ({error, transactions}) => {
  const lnd = makeLnd({});

  lnd.chain.registerConfirmationsNtfn = args => {
    const sub = new EventEmitter();

    sub.cancel = () => {};

    setImmediate(() => {
      // Exit early when the subscription should fail
      if (!!error) {
        return sub.emit('error', error);
      }

      return (transactions || []).forEach((transaction, i) => {
        return sub.emit('data', {
          conf: {
            block_hash: Buffer.alloc(32, 1),
            block_height: 500 + i,
            raw_tx: Buffer.from(transaction, 'hex'),
          },
        });
      });
    });

    return sub;
  };

  return lnd;
};

const makeArgs = overrides => {
  const args = {
    lnd: makeChainLnd({transactions: [missTransaction, matchTransaction]}),
    output_script: outputScript,
    start_height: 100,
    timeout_ms: 1000 * 5,
    tokens: 5000,
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const tests = [
  {
    args: makeArgs({lnd: undefined}),
    description: 'An lnd object is required to find a confirmed output',
    error: [400, 'ExpectedAuthenticatedLndToFindOnchainOutput'],
  },
  {
    args: makeArgs({output_script: undefined}),
    description: 'An output script is required to find a confirmed output',
    error: [400, 'ExpectedOutputScriptToFindOnchainOutput'],
  },
  {
    args: makeArgs({start_height: undefined}),
    description: 'A start height is required to find a confirmed output',
    error: [400, 'ExpectedStartHeightToFindOnchainOutput'],
  },
  {
    args: makeArgs({timeout_ms: undefined}),
    description: 'A timeout is required to find a confirmed output',
    error: [400, 'ExpectedTimeoutToFindOnchainOutputBy'],
  },
  {
    args: makeArgs({tokens: undefined}),
    description: 'A tokens amount is required to find a confirmed output',
    error: [400, 'ExpectedTokensAmountToFindOnchainOutput'],
  },
  {
    args: makeArgs({timeout_ms: 50, lnd: makeChainLnd({transactions: []})}),
    description: 'A confirmation that never comes results in a timeout',
    error: [503, 'TimedOutWaitingForOnchainOutput'],
  },
  {
    args: makeArgs({lnd: makeChainLnd({error: {message: 'SubErr'}})}),
    description: 'A subscription error is returned',
    error: {message: 'SubErr'},
  },
  {
    args: makeArgs({}),
    description: 'A confirmed output is found',
    expected: {
      confirmation_height: 501,
      is_coinbase: false,
      transaction_id: matchTransactionId,
      transaction_vout: 0,
    },
  },
  {
    args: makeArgs({
      lnd: makeChainLnd({transactions: [coinbaseTransaction]}),
      min_confirmations: 6,
      output_script: outputScript.toUpperCase(),
    }),
    description: 'A coinbase output is found for an uppercase script',
    expected: {
      confirmation_height: 500,
      is_coinbase: true,
      transaction_id: coinbaseTransactionId,
      transaction_vout: 0,
    },
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

    return;
  });
});
