const {test} = require('@alexbosworth/tap');
const {spawnLightningCluster} = require('ln-docker-daemons');

const {getNetwork} = require('./../../');

const tests = [
  {
    args: ({lnd}) => ({lnd}),
    description: 'Get network name',
    expected: ({}) => ({network: 'btcregtest'}),
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async ({end, fail, strictSame}) => {
    const [{id, kill, lnd}] = (await spawnLightningCluster({})).nodes;

    try {
      const res = await getNetwork(args({id, lnd}));

      strictSame(res, expected({id}), 'Got expected result');
    } catch (err) {
      fail(err);
    }

    await kill({});

    return end();
  });
});
