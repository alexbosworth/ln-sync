const {deepEqual} = require('node:assert').strict;
const {throws} = require('node:assert').strict;
const test = require('node:test');

const method = require('./../../funding/is_bech32_encoded');

const tests = [
  {
    args: {
      input: 'tb1qzmswhxxwxvhat6ke3wu27gqqxn4qxqn6qwarwkz6lmky3l3jqjfqy5wl9x',
    },
    description: 'A bech32 address is bech32 encoded',
    expected: {is_bech32: true},
  },
  {
    args: {input: 'invalid bech32 input'},
    description: 'Non bech32 content is not bech32 encoded',
    expected: {is_bech32: false},
  },
  {
    args: {
      input: 'tb1pqqqqp399et2xygdj5xreqhjjvcmzhxw4aywxecjdzew6hylgvsesf3hn0c',
    },
    description: 'A bech32m address is bech32 encoded',
    expected: {is_bech32: true},
  },
  {
    args: {
      input: 'tb1z0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqglt7rf',
    },
    description: 'A v2 address with a bech32 checksum is not a valid address',
    expected: {is_bech32: false},
  },
  {
    args: {
      input: 'tc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vq5zuyut',
    },
    description: 'An address with an unknown prefix is not a valid address',
    expected: {is_bech32: false},
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
