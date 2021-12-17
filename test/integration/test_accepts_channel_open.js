const {once} = require('events');

const {addPeer} = require('ln-service');
const asyncAuto = require('async/auto');
const asyncRetry = require('async/retry');
const {cancelPendingChannel} = require('ln-service');
const {getPendingChannels} = require('ln-service');
const {openChannels} = require('ln-service');
const {spawnLightningCluster} = require('ln-docker-daemons');
const {subscribeToOpenRequests} = require('ln-service');
const {test} = require('@alexbosworth/tap');

const {acceptsChannelOpen} = require('./../../');

const capacity = 1e6;
const feeTokensPerVbyte = 3;
const interval = 10;
const maturityBlocks = 100;
const size = 2;
const times = 2000;

return test('Check if peer accepts open', async ({end, fail, strictSame}) => {
  const {kill, nodes} = await spawnLightningCluster({size});

  const [{generate, id, lnd}, target] = nodes;

  try {
    // Make some coins
    await generate({count: maturityBlocks});

    // Connect to the target
    await addPeer({lnd, public_key: target.id, socket: target.socket});

    // Propose a channel to target
    const shouldAccept = await asyncRetry({interval, times}, async () => {
      return await acceptsChannelOpen({
        capacity,
        lnd,
        give_tokens: capacity / [lnd, target].length,
        is_private: true,
        partner_public_key: target.id,
      });
    });

    strictSame(shouldAccept, {is_accepted: true}, 'Node accepts a channel');

    const sub = subscribeToOpenRequests({lnd: target.lnd});

    // Reject the upcoming channel request on the target
    sub.once('channel_request', request => request.reject({}));

    try {
      await acceptsChannelOpen({
        capacity,
        lnd,
        give_tokens: capacity / [lnd, target].length,
        is_private: true,
        partner_public_key: target.id,
      });
    } catch (err) {
      strictSame(!!err, true, 'Channel is rejected');
    }
  } catch (err) {
    strictSame(err, null, 'Expected no error');
  } finally {
    await kill({});

    return end();
  }
});
