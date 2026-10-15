const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const getNodeAlias = require('./../../graph/get_node_alias');

const id = Buffer.alloc(33, 3).toString('hex');

const makeLnd = ({alias, err}) => {
  return {
    default: {
      getNodeInfo: ({}, cbk) => {
        // Exit early when getting the node should fail
        if (!!err) {
          return cbk(err);
        }

        return cbk(null, {
          channels: [],
          node: {
            alias,
            addresses: [],
            color: '#000000',
            features: {},
            last_update: 1,
            pub_key: id,
          },
          num_channels: 0,
          total_capacity: '0',
        });
      },
    },
  };
};

const makeArgs = overrides => {
  const args = {id, lnd: makeLnd({alias: 'alias'})};

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const tests = [
  {
    args: makeArgs({id: undefined}),
    description: 'A public key is required to get a node alias',
    error: [400, 'ExpectedPublicKeyToGetNodeAliasFor'],
  },
  {
    args: makeArgs({lnd: undefined}),
    description: 'An lnd object is required to get a node alias',
    error: [400, 'ExpectedAuthenticatedLndToGetNodeAlias'],
  },
  {
    args: makeArgs({lnd: makeLnd({err: {details: 'unable to find node'}})}),
    description: 'An unknown node has an empty alias',
    expected: {id, alias: ''},
  },
  {
    args: makeArgs({lnd: makeLnd({alias: ''})}),
    description: 'A node without an alias has an empty alias',
    expected: {id, alias: ''},
  },
  {
    args: makeArgs({}),
    description: 'A node alias is returned',
    expected: {id, alias: 'alias'},
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    if (!!error) {
      await rejects(getNodeAlias(args), error, 'Got expected error');
    } else {
      deepEqual(await getNodeAlias(args), expected, 'Got expected result');
    }

    return;
  });
});
