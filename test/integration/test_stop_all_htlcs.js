const asyncAuto = require('async/auto');
const asyncMap = require('async/map');
const asyncRetry = require('async/retry');
const {closeChannel} = require('ln-service');
const {createChainAddress} = require('ln-service');
const {createInvoice} = require('ln-service');
const {deleteForwardingReputations} = require('ln-service');
const {getChannels} = require('ln-service');
const {getHeight} = require('ln-service');
const {openChannel} = require('ln-service');
const {pay} = require('ln-service');
const {sendToChainAddress} = require('ln-service');
const {spawnLightningCluster} = require('ln-docker-daemons');
const {test} = require('@alexbosworth/tap');

const {stopAllHtlcs} = require('./../../');

const capacity = 1e6;
const interval = 100;
const maturity = 100;
const size = 3;
const times = 2000;
const tokens = 10;
const uniq = arr => Array.from(new Set(arr));

return test('Stop all HTLCs', async ({end, strictSame}) => {
  const {kill, nodes} = (await spawnLightningCluster({size}));

  const [control, target, remote] = nodes;

  const {generate, lnd} = control;

  await generate({count: maturity});

  await asyncRetry({interval, times}, async () => {
    const hashes = await asyncMap([lnd, target.lnd, remote.lnd], async n => {
      return (await getHeight({lnd: n})).current_block_hash;
    });

    const [hash, other] = uniq(hashes);

    if (!!other) {
      throw new Error('ExpectedNoOtherHash');
    }
  });

  try {
    // Setup a channel to the target
    await openChannel({
      lnd,
      local_tokens: capacity,
      partner_public_key: target.id,
      partner_socket: target.socket,
    });

    const id = await asyncRetry({interval, times}, async () => {
      const [id] = (await getChannels({lnd})).channels.map(n => n.id);

      await generate({});

      if (!id) {
        throw new Error('ExpectedChannelCreated');
      }

      const {request} = await createInvoice({tokens, lnd: target.lnd});

      await pay({lnd, request});

      return id;
    });

    const {address} = await createChainAddress({lnd: target.lnd});

    await sendToChainAddress({address, lnd, tokens: capacity});

    await asyncRetry({interval, times}, async () => {
      await generate({});

      await openChannel({
        is_private: true,
        lnd: target.lnd,
        local_tokens: capacity / [target, remote].length,
        partner_public_key: remote.id,
        partner_socket: remote.socket,
      });
    });

    await asyncRetry({interval, times}, async () => {
      await generate({});

      const {request} = await createInvoice({
        tokens,
        is_including_private_channels: true,
        lnd: remote.lnd,
      });

      await deleteForwardingReputations({lnd});

      await pay({lnd, request});
    });

    await asyncAuto({
      // Stop the HTLCs
      stop: async () => {
        return await stopAllHtlcs({
          id,
          ids: [id],
          lnd: target.lnd,
          peer: control.id,
        });
      },

      // Attempt an HTLC and get denied
      attempt: async () => {
        const {request} = await createInvoice({
          tokens,
          is_including_private_channels: true,
          lnd: remote.lnd,
        });

        await deleteForwardingReputations({lnd});

        try {
          await pay({lnd, request});

          throw new Error('ExpectedAttemptIsRejected');
        } catch (err) {
          return;
        }
      },

      // HTLC stopping will halt when the channel closes
      end: ['attempt', async () => {
        return await closeChannel({id, is_force_close: true, lnd: target.lnd});
      }],
    });

    // Try paying to confirm it fails
    // Close the channel
  } catch (err) {
    strictSame(err, null, 'Expected no error');
  } finally {
    await kill({});
  }

  return end();
});
