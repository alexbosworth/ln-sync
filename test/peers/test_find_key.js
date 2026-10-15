const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const findKey = require('./../../peers/find_key');
const {listChannelsResponse} = require('./../fixtures');

const alice = Buffer.alloc(33, 2).toString('hex');
const bob = Buffer.alloc(33, 3).toString('hex');
const carol = Buffer.alloc(33, 4).toString('hex');
const dave = Buffer.alloc(33, 5).toString('hex');
const failing = Buffer.alloc(33, 6).toString('hex');

const aliases = {[alice]: 'Alice', [bob]: 'Bob', [dave]: ''};

const lnd = {
  default: {
    getNodeInfo: ({pub_key}, cbk) => {
      // Exit early when the node is not known in the graph
      if (pub_key === carol) {
        return cbk({details: 'unable to find node'});
      }

      // Exit early when there is a failure getting the node
      if (pub_key === failing) {
        return cbk('err');
      }

      return cbk(null, {
        channels: [],
        node: {
          addresses: [],
          alias: aliases[pub_key],
          color: '#000000',
          features: {},
          last_update: 1,
          pub_key,
        },
        num_channels: 0,
        total_capacity: '0',
      });
    },
    listChannels: ({}, cbk) => cbk(null, {
      channels: [{...listChannelsResponse.channels[0], remote_pubkey: alice}],
    }),
  },
};

const channels = [alice, alice, bob, carol, dave].map(key => ({
  partner_public_key: key,
}));

const makeArgs = overrides => {
  const args = {channels, lnd, query: 'ali'};

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const tests = [
  {
    args: makeArgs({lnd: undefined}),
    description: 'An lnd object is required to find a key',
    error: [400, 'ExpectedAuthenticatedLndToFindPublicKey'],
  },
  {
    args: makeArgs({query: 1}),
    description: 'A string query is required to search for a key',
    error: [400, 'InvalidEmptyQuerySpecifiedForMatchSearchQuery'],
  },
  {
    args: makeArgs({query: 'eve'}),
    description: 'A query that matches no peer returns an error',
    error: [400, 'FailedToFindPeerAliasMatch', {not_found: 'eve'}],
  },
  {
    args: makeArgs({query: '0'}),
    description: 'A query that matches multiple peers returns an error',
    error: [
      400,
      'AmbiguousAliasSpecified',
      {
        matching: [
          {alias: 'Alice', public_key: alice},
          {alias: 'Bob', public_key: bob},
          {alias: '', public_key: dave},
        ],
      },
    ],
  },
  {
    args: makeArgs({
      channels: [{partner_public_key: failing}],
      query: 'eve',
    }),
    description: 'A failure to get a node returns an error',
    error: [503, 'FailedToRetrieveNodeDetails', {err: 'err'}],
  },
  {
    args: makeArgs({query: undefined}),
    description: 'No query returns no public key',
    expected: {public_key: undefined},
  },
  {
    args: makeArgs({query: carol}),
    description: 'A public key query returns the public key',
    expected: {public_key: carol},
  },
  {
    args: makeArgs({}),
    description: 'An alias query returns the matching peer public key',
    expected: {public_key: alice},
  },
  {
    args: makeArgs({query: '0303'}),
    description: 'A partial public key query returns the matching key',
    expected: {public_key: bob},
  },
  {
    args: makeArgs({channels: undefined}),
    description: 'Peers are found from channels when channels are not passed',
    expected: {public_key: alice},
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    if (!!error) {
      await rejects(findKey(args), error, 'Got expected error');
    } else {
      deepEqual(await findKey(args), expected, 'Got expected result');
    }

    return;
  });
});
