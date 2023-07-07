const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const {addPeer} = require('ln-service');
const asyncAuto = require('async/auto');
const asyncRetry = require('async/retry');
const {spawnLightningCluster} = require('ln-docker-daemons');

const {waitForConnectedPeer} = require('./../../');

const size = 2;

return test('Peer is connected', async () => {
  const {kill, nodes} = (await spawnLightningCluster({size}));

  const [{lnd}, target] = nodes;

  try {
    await rejects(
      waitForConnectedPeer({lnd, id: target.id, timeout: 10}),
      [504, 'FailedToFindConnectedPeer'],
      'Waiting for peer times out'
    );

    await asyncRetry({}, async () => {
      await addPeer({lnd, public_key: target.id, socket: target.socket});
    });

    await waitForConnectedPeer({lnd, id: target.id});
  } catch (err) {
    deepEqual(err, null, 'No error is expected');
  }

  await kill({});

  return;
});
