const {deepEqual} = require('node:assert').strict;
const test = require('node:test');

const percentile = require('./../../peers/percentile');

const tests = [
  {
    args: {above: 0.5, tokens: []},
    description: 'A percentile of no values is zero',
    expected: {top: 0},
  },
  {
    args: {above: 0, tokens: [3, 1, 2]},
    description: 'A percentile at the bottom is the lowest value',
    expected: {top: 1},
  },
  {
    args: {above: 1, tokens: [3, 1, 2]},
    description: 'A percentile at the top is the highest value',
    expected: {top: 3},
  },
  {
    args: {above: 0.5, tokens: [5]},
    description: 'A percentile of a single value is that value',
    expected: {top: 5},
  },
  {
    args: {above: 0.5, tokens: [4, 1, 3, 2]},
    description: 'A percentile is interpolated between values',
    expected: {top: 2.5},
  },
];

tests.forEach(({args, description, expected}) => {
  return test(description, (t, end) => {
    deepEqual(percentile(args), expected, 'Got expected percentile');

    return end();
  });
});
