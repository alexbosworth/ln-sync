const {deepEqual} = require('node:assert').strict;
const test = require('node:test');
const {throws} = require('node:assert').strict;

const method = require('./../../funding/bech32_address_as_script');

const tests = [
  {
    args: {
      address: 'tb1qzmswhxxwxvhat6ke3wu27gqqxn4qxqn6qwarwkz6lmky3l3jqjfqy5wl9x',
    },
    description: 'Derive output script for address.',
    expected: {
      script: '002016e0eb98ce332fd5ead98bb8af200034ea03027a03ba37585afeec48fe320492',
    },
  },
  {
    args: {
      address: 'tb1pqqqqp399et2xygdj5xreqhjjvcmzhxw4aywxecjdzew6hylgvsesf3hn0c',
    },
    description: 'Derive output script for v1 address.',
    expected: {
      script: '5120000000c4a5cad46221b2a187905e5266362b99d5e91c6ce24d165dab93e86433',
    },
  },
  {
    args: {
      address: 'bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqh2y7hd',
    },
    description: 'A v1 address must use bech32m encoding',
    error: 'ExpectedUseOfLaterVersionBech32PostInitialSegwit',
  },
  {
    args: {
      address: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kemeawh',
    },
    description: 'A v0 address must use bech32 encoding',
    error: 'ExpectedInitialSegwitTypeForInitialSegwitVersion',
  },
  {
    args: {address: 'BC1QR508D6QEJXTDG4Y5R3ZARVARYV98GJ9P'},
    description: 'A v0 address must have a valid program length',
    error: 'UnexpectedBech32AddressProgramSizeForV0Address',
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, (t, end) => {
    if (!!error) {
      throws(() => method(args), new Error(error), 'Error returned');

      return end();
    } else {
      const got = method(args);

      deepEqual(got, expected, 'Got expected result');
    }

    return end();
  });
});
