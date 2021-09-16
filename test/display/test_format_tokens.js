const {test} = require('@alexbosworth/tap');

const {formatTokens} = require('./../../');

const asHex = str => Buffer.from(str).toString('hex');

const tests = [
  {
    args: {},
    description: 'No tokens results in empty string',
    expected: '20',
  },
  {
    args: {is_monochrome: true, tokens: 1},
    description: 'Monochrome tokens do not have color',
    expected: '302e3030303030303031',
  },
  {
    args: {tokens: 1},
    description: 'Small amounts are dimmed in color',
    expected: '1b5b326d302e30303030303030311b5b32326d',
  },
  {
    args: {tokens: 1001},
    description: 'Regular amounts are not dimmed',
    expected: '302e3030303031303031',
  },
  {
    args: {tokens: 1000001},
    description: 'Larger amounts are highlighted',
    expected: '1b5b33326d302e30313030303030311b5b33396d',
  },
  {
    args: {tokens: 5000000},
    description: 'Large amounts are full color',
    expected: '1b5b316d1b5b33326d302e30353030303030301b5b33396d1b5b32326d',
  },
];

tests.forEach(({args, description, expected}) => {
  return test(description, ({end, equal}) => {
    const {display} = formatTokens(args);

    equal(asHex(display), expected, 'Got expected display value');

    return end();
  });
});
