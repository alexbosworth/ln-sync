const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const getSeedNodes = require('./../../graph/get_seed_nodes');

const makeArgs = overrides => {
  const args = {
    network: 'btc',
    request: ({}, cbk) => cbk(null, null, {
      nodes: [
        {is_balanced: true, public_key: Buffer.alloc(33, 2).toString('hex')},
        {is_balanced: false, public_key: Buffer.alloc(33, 3).toString('hex')},
      ],
    }),
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const tests = [
  {
    args: makeArgs({network: 'unknown'}),
    description: 'A known network is required to get seed nodes',
    error: [400, 'ExpectedNetworkToGetSeedNodes'],
  },
  {
    args: makeArgs({request: undefined}),
    description: 'A request function is required to get seed nodes',
    error: [400, 'ExpectedRequestFunctionToGetSeedNodes'],
  },
  {
    args: makeArgs({request: ({}, cbk) => cbk('err')}),
    description: 'A request error is returned',
    error: [503, 'UnexpectedErrorGettingSeedNodes', {err: 'err'}],
  },
  {
    args: makeArgs({request: ({}, cbk) => cbk()}),
    description: 'A response is expected',
    error: [503, 'UnexpectedResultFromSeedNodesResponse'],
  },
  {
    args: makeArgs({request: ({}, cbk) => cbk(null, null, {nodes: 'nodes'})}),
    description: 'A response with an array of nodes is expected',
    error: [503, 'UnexpectedResultFromSeedNodesResponse'],
  },
  {
    args: makeArgs({request: ({}, cbk) => cbk(null, null, {nodes: [{}]})}),
    description: 'Nodes with public keys are expected',
    error: [503, 'ExpectedPublicKeyInSeedNodesResult'],
  },
  {
    args: makeArgs({}),
    description: 'Balanced seed nodes are returned',
    expected: {nodes: [{public_key: Buffer.alloc(33, 2).toString('hex')}]},
  },
  {
    args: makeArgs({
      network: 'btctestnet',
      request: ({url}, cbk) => cbk(null, null, {
        nodes: [{is_balanced: true, public_key: url}],
      }),
    }),
    description: 'Seed nodes are requested for the specified network',
    expected: {
      nodes: [{public_key: 'https://yalls.org/v0/graph/list/testnet'}],
    },
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    if (!!error) {
      await rejects(getSeedNodes(args), error, 'Got expected error');
    } else {
      deepEqual(await getSeedNodes(args), expected, 'Got expected result');
    }

    return;
  });
});
