const {addPeer} = require('ln-service');
const asyncRetry = require('async/retry');
const {fundPendingChannels} = require('ln-service');
const {fundPsbt} = require('ln-service');
const {getPendingChannels} = require('ln-service');
const {openChannels} = require('ln-service');
const {signPsbt} = require('ln-service');
const {spawnLightningCluster} = require('ln-docker-daemons');
const {test} = require('@alexbosworth/tap');

const {waitForPendingOpen} = require('./../../');

const capacity = 1e6;
const feeTokensPerVbyte = 3;
const interval = 10;
const maturityBlocks = 100;
const size = 2;
const times = 2000;

return test('Wait for a pending open', async ({end, fail, strictSame}) => {
  const {kill, nodes} = await spawnLightningCluster({size});

  const [{generate, id, lnd}, target] = nodes;

  try {
    // Make some coins
    await generate({count: maturityBlocks});

    // Connect to the target
    await addPeer({lnd, public_key: target.id, socket: target.socket});

    // Propose a channel to target
    const {pending} = await openChannels({
      lnd,
      channels: [{
        capacity,
        is_private: true,
        give_tokens: capacity / [lnd, target].length,
        partner_public_key: target.id,
      }],
      is_avoiding_broadcast: true,
    });

    // Create a funded PSBT to fund the channel open
    const {psbt} = await signPsbt({
      lnd,
      psbt: (await fundPsbt({lnd, outputs: pending})).psbt,
    });

    // Fund the open channels with the PSBT
    await fundPendingChannels({
      lnd,
      channels: pending.map(n => n.id),
      funding: psbt,
    });

    // Get the channel details on the control side
    const channel = await asyncRetry({interval, times}, async () => {
      const [channel] = (await getPendingChannels({lnd})).pending_channels;

      if (!channel) {
        throw new Error('ExpectedChannelPendingForProposal');
      }

      return channel;
    });

    // Wait for a pending channel to appear
    const got = await waitForPendingOpen({
      capacity,
      interval,
      times,
      lnd: target.lnd,
      local_balance: capacity / [lnd, target].length,
      partner_public_key: id,
      transaction_id: channel.transaction_id,
      transaction_vout: channel.transaction_vout,
    });

    strictSame(got.transaction_id, channel.transaction_id, 'Got tx id');
    strictSame(got.transaction_vout, channel.transaction_vout, 'Got tx vout');
  } catch (err) {
    strictSame(err, null, 'Expected no error');
  } finally {
    await kill({});

    return end();
  }
});
