const {deepEqual} = require('node:assert').strict;
const test = require('node:test');
const {throws} = require('node:assert').strict;

const method = require('./../../funding/address_as_output_script');

const tests = [
  {
    args: {address: 'bc1qqurswpc8qurswpc8qurswpc8qurswpc89fe3yv'},
    description: 'A p2wpkh address is mapped to an output script',
    expected: {script: '0014' + '07'.repeat(20)},
  },
  {
    args: {
      address: 'bc1pzyq3zqg3qygszygpzyq3zqg3qygszygpzyq3zqg3qygszygpzyqstwjakd',
    },
    description: 'A p2tr address is mapped to an output script',
    expected: {script: '5120' + '1101'.repeat(16)},
  },
  {
    args: {address: '1jU2ZiwRwvA6oxkbqz1opzaxWMFyovCBf'},
    description: 'A p2pkh address is mapped to an output script',
    expected: {script: '76a914' + '08'.repeat(20) + '88ac'},
  },
  {
    args: {address: '32Wnq4482y6gaTH9vYmjaorU6iZFt2Tonc'},
    description: 'A p2sh address is mapped to an output script',
    expected: {script: 'a914' + '09'.repeat(20) + '87'},
  },
  {
    args: {address: 'M8pF1tJq3CpFmSB2E2tCkobpR74zBsBDmi'},
    description: 'An unknown address version has no output script',
    error: 'UnexpectedAddressVersionToDeriveOutputScript',
  },
  {
    args: {address: 'not an address'},
    description: 'A valid address is required to derive an output script',
    error: 'ExpectedAllBase58CharactersInBase58Address',
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, (t, end) => {
    if (!!error) {
      throws(() => method(args), new Error(error), 'Got expected error');
    } else {
      const got = method(args);

      deepEqual(got, expected, 'Got expected result');
    }

    return end();
  });
});
