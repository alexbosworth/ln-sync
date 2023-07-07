const {deepEqual} = require('node:assert').strict;
const {fail} = require('node:assert').strict;
const test = require('node:test');

const {spawnLightningCluster} = require('ln-docker-daemons');

const {getNetwork} = require('./../../');

const tests = [
  {
    args: ({lnd}) => ({lnd}),
    description: 'Get network name',
    expected: ({}) => ({bitcoinjs: 'regtest', network: 'btcregtest'}),
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    const [{id, kill, lnd}] = (await spawnLightningCluster({})).nodes;

    try {
      const res = await getNetwork(args({id, lnd}));

      deepEqual(res, expected({id}), 'Got expected result');
    } catch (err) {
      fail(err);
    }

    await kill({});

    return;
  });
});
