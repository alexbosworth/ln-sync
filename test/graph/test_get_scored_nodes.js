const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const {getScoredNodes} = require('./../../');

const key = Buffer.alloc(33, 2).toString('hex');

const tests = [
  {
    args: {},
    description: 'Getting scored nodes requires a network name',
    error: [400, 'ExpectedNetworkToGetScoredNodes'],
  },
  {
    args: {network: 'btc'},
    description: 'Getting scored nodes requires a request function',
    error: [400, 'ExpectedRequestFunctionToGetScoredNodes'],
  },
  {
    args: {network: 'btc', request: ({}, cbk) => cbk('err')},
    description: 'An error is passed back from a failed request',
    error: [503, 'UnexpectedErrorGettingNodeScores', {err: 'err'}],
  },
  {
    args: {network: 'btc', request: ({}, cbk) => cbk()},
    description: 'A response is expected from the scores API',
    error: [503, 'UnexpectedResultFromNodeScores'],
  },
  {
    args: {network: 'btc', request: ({}, cbk) => cbk(null, null, {})},
    description: 'An array of scores is expected from the scores API',
    error: [503, 'UnexpectedResultFromNodeScores'],
  },
  {
    args: {
      network: 'btc',
      request: ({}, cbk) => cbk(null, null, {scores: [{}]}),
    },
    description: 'A public key is required in a scored node',
    error: [503, 'ExpectedPublicKeyInNodeScoresResult'],
  },
  {
    args: {
      network: 'btc',
      request: ({}, cbk) => cbk(null, null, {scores: [null]}),
    },
    description: 'A scored node is required to be present',
    error: [503, 'ExpectedPublicKeyInNodeScoresResult'],
  },
  {
    args: {
      network: 'btc',
      request: ({}, cbk) => cbk(null, null, {scores: [{public_key: 'a'}]}),
    },
    description: 'A valid public key is required in a scored node',
    error: [503, 'ExpectedPublicKeyInNodeScoresResult'],
  },
  {
    args: {
      network: 'btc',
      request: ({}, cbk) => cbk(null, null, {
        scores: [{public_key: [key], score: 1}],
      }),
    },
    description: 'A public key in a scored node is required to be a string',
    error: [503, 'ExpectedPublicKeyInNodeScoresResult'],
  },
  {
    args: {
      network: 'btc',
      request: ({}, cbk) => cbk(null, null, {scores: [{public_key: key}]}),
    },
    description: 'A score is required in a scored node',
    error: [503, 'ExpectedScoreInNodeScoresResult'],
  },
  {
    args: {
      network: 'btc',
      request: ({}, cbk) => cbk(null, null, {
        scores: [{public_key: key, score: 1}],
      }),
    },
    description: 'A request to the scores API returns scored nodes',
    expected: {nodes: [{public_key: key, score: 1}]},
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    if (!!error) {
      await rejects(getScoredNodes(args), error, 'Got expected error');
    } else {
      const {nodes} = await getScoredNodes(args);

      deepEqual(nodes, expected.nodes, 'Got expected nodes');
    }

    return;
  });
});
