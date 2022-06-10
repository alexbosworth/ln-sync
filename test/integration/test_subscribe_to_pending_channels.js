const {addPeer} = require('ln-service');
const asyncRetry = require('async/retry');
const {closeChannel} = require('ln-service');
const {openChannel} = require('ln-service');
const {spawnLightningCluster} = require('ln-docker-daemons');
const {test} = require('@alexbosworth/tap');

const {subscribeToPendingChannels} = require('./../../');

const capacity = 1e6;
const count = 100;
const delay = 100;
const interval = 10;
const size = 2;
const times = 1000;

return test('Subscribe to pending chans', async ({end, fail, strictSame}) => {
  const {kill, nodes} = (await spawnLightningCluster({size}));

  const [{generate, lnd}, target] = nodes;

  try {
    const sub = subscribeToPendingChannels({delay, lnd});

    const closing = [];
    const opening = [];

    sub.on('closing', n => closing.push(n))
    sub.on('opening', n => opening.push(n));

    await generate({count});

    const channel = await asyncRetry({interval, times}, async () => {
      return await openChannel({
        lnd,
        local_tokens: capacity,
        partner_public_key: target.id,
        partner_socket: target.socket,
      });
    });

    await asyncRetry({interval, times}, async () => {
      if (!opening.length) {
        throw new Error('ExpectedChannelOpening');
      }
    });

    await closeChannel({
      lnd,
      is_force_close: true,
      transaction_id: channel.transaction_id,
      transaction_vout: channel.transaction_vout,
    });

    await asyncRetry({interval, times}, async () => {
      if (!closing.length) {
        throw new Error('ExpectedChannelClosing');
      }
    });
  } catch (err) {
    strictSame(err, null, 'Expected no error');
  }

  await kill({});

  return end();
});
