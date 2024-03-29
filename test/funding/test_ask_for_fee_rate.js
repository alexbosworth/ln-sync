const {deepEqual} = require('node:assert').strict;
const {makeLnd} = require('mock-lnd');
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const {askForFeeRate} = require('./../../');

const method = askForFeeRate;

const makeArgs = overrides => {
  const args = {
    ask: ({}, cbk) => cbk({rate: 1}),
    lnd: makeLnd({}),
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const tests = [
  {
    args: makeArgs({ask: undefined}),
    description: 'An ask function is required',
    error: [400, 'ExpectedAskFunctionToAskForChainFeeRate'],
  },
  {
    args: makeArgs({lnd: undefined}),
    description: 'LND is required',
    error: [400, 'ExpectedAuthenticatedLndToAskForChainFeeRate'],
  },
  {
    args: makeArgs({ask: ({}, cbk) => cbk({rate: 0})}),
    description: 'A fee rate is required',
    error: [400, 'ExpectedChainFeeRate'],
  },
  {
    args: makeArgs({ask: ({}, cbk) => cbk({rate: 0.5})}),
    description: 'A minimal fee rate is required',
    error: [400, 'ExpectedHigherMinFeePerVbyte', {minimum: 1}],
  },
  {
    args: makeArgs({ask: ({}, cbk) => cbk({rate: 1e8})}),
    description: 'A regular fee rate is required',
    error: [400, 'MaxFeePerVbyteExceeded', {maximum: 100}],
  },
  {
    args: makeArgs({}),
    description: 'A fee rate is derived',
    expected: {tokens_per_vbyte: 1},
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    if (!!error) {
      await rejects(method(args), error, 'Got expected error');
    } else {
      const got = await method(args);

      deepEqual(got, expected, 'Got expected result');
    }

    return;
  });
});
