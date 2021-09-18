const {test} = require('@alexbosworth/tap');
const {spawnLightningCluster} = require('ln-docker-daemons');

const {getNodeAlias} = require('./../../');

const tests = [
  {
    args: ({id, lnd}) => ({id, lnd}),
    description: 'Get a node alias',
    expected: ({id}) => ({id, alias: id.slice(0, 20)}),
  },
  {
    args: ({id, lnd}) => ({lnd, id: Buffer.alloc(33, 3).toString('hex')}),
    description: 'No error when id does not exist',
    expected: ({}) => ({alias: '', id: Buffer.alloc(33, 3).toString('hex')}),
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async ({end, fail, strictSame}) => {
    const [{id, kill, lnd}] = (await spawnLightningCluster({})).nodes;

    try {
      const res = await getNodeAlias(args({id, lnd}));

      strictSame(res, expected({id}), 'Got expected result');
    } catch (err) {
      fail(err);
    }

    await kill({});

    return end();
  });
});
