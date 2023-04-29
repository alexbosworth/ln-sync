const {addPeer} = require('ln-service');
const asyncRetry = require('async/retry');
const {createChainAddress} = require('ln-service');
const {createHodlInvoice} = require('ln-service');
const {createInvoice} = require('ln-service');
const {deleteForwardingReputations} = require('ln-service');
const {getChannels} = require('ln-service');
const {openChannel} = require('ln-service');
const {pay} = require('ln-service');
const {sendToChainAddress} = require('ln-service');
const {settleHodlInvoice} = require('ln-service');
const {spawnLightningCluster} = require('ln-docker-daemons');
const {subscribeToInvoice} = require('ln-service');
const {test} = require('@alexbosworth/tap');

const {enforceForwardRequestRules} = require('./../../');

const capacity = 1e6;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const give = 1e5;
const interval = 10;
const maturityBlocks = 100;
const size = 3;
const targetTokens = 1e7;
const times = 1000;
const tokens = 100;

const lnService = require('ln-service');

return test('Request rules are enforced', async ({end, fail, strictSame}) => {
  const {kill, nodes} = await spawnLightningCluster({size});

  const [{generate, id, lnd}, target, remote] = nodes;

  try {
    // Make some coins
    await generate({count: maturityBlocks});

    // Peer up control and remote to help with graph search
    await addPeer({lnd, public_key: remote.id, socket: remote.socket});

    // Send some coins to target
    await sendToChainAddress({
      lnd,
      address: (await createChainAddress({lnd: target.lnd})).address,
      tokens: targetTokens,
    });

    // Setup a channel between control and target
    await asyncRetry({interval, times}, async () => {
      await generate({});

      await openChannel({
        lnd,
        give_tokens: give,
        local_tokens: capacity,
        partner_public_key: target.id,
        partner_socket: target.socket,
      });
    });

    // Setup a channel between target and remote
    await asyncRetry({interval, times}, async () => {
      await generate({});

      await openChannel({
        give_tokens: give,
        lnd: target.lnd,
        local_tokens: capacity,
        partner_public_key: remote.id,
        partner_socket: remote.socket,
      });
    });

    // A block must have appeared recently
    {
      // Make sure payments work normally
      await asyncRetry({interval, times}, async () => {
        await generate({});

        await pay({
          lnd,
          request: (await createInvoice({tokens, lnd: remote.lnd})).request,
        });
      });

      // Stop payments when the last block was too long ago
      const sub = enforceForwardRequestRules({
        lnd: target.lnd,
        max_seconds_since_last_block: 1,
      });

      const rejection = [];

      sub.on('rejected', rejected => rejection.push(rejected));

      await target.generate({});

      // Wait to make the block take too long
      await delay(2000);

      // Payment will be rejected
      try {
        const payment = await pay({
          lnd,
          request: (await createInvoice({tokens, lnd: remote.lnd})).request,
        });

        strictSame(payment, null, 'Payment should have been blocked');
      } catch (err) {
        strictSame(
          err,
          [503, 'PaymentPathfindingFailedToFindPossibleRoute'],
          'Blocks that take too long trigger rejection'
        );
      }

      const [rejected] = rejection;

      strictSame(
        rejected.reject_reason,
        'LastBlockReceivedTooLongAgo',
        'Block time constraint returns block timing reason'
      );

      sub.removeAllListeners();
    }

    // Channels must have many confirmations
    {
      // Start from a clean state
      await deleteForwardingReputations({lnd});

      // Make sure payments work normally
      await asyncRetry({interval, times}, async () => {
        await generate({});

        await pay({
          lnd,
          request: (await createInvoice({tokens, lnd: remote.lnd})).request,
        });
      });

      // Stop payments when channels are too new
      const sub = enforceForwardRequestRules({
        lnd: target.lnd,
        min_activation_age: 150,
      });

      const rejection = [];

      sub.on('rejected', rejected => rejection.push(rejected));

      // Payment will be rejected because the channels are new
      try {
        const payment = await pay({
          lnd,
          request: (await createInvoice({tokens, lnd: remote.lnd})).request,
        });

        strictSame(payment, null, 'Payment should have been blocked');
      } catch (err) {
        strictSame(
          err,
          [503, 'PaymentPathfindingFailedToFindPossibleRoute'],
          'New channels reject payments'
        );
      }

      const [rejected] = rejection;

      strictSame(
        rejected.reject_reason,
        'WaitingForChannelConfirmationActivation',
        'Activation age successfully blocks forwards'
      );

      // Reset to clean MC state
      await deleteForwardingReputations({lnd});

      await target.generate({count: 100});

      try {
        // Make sure payments work normally after blocks confirm
        const normalPayment = await asyncRetry({interval, times}, async () => {
          await target.generate({count: 100});

          await deleteForwardingReputations({lnd});

          return await pay({
            lnd,
            request: (await createInvoice({tokens, lnd: remote.lnd})).request,
          });
        });

        strictSame(!!normalPayment, true, 'Payment is made after confs');
      } catch (err) {
        strictSame(err, null, 'Expected no error after enough blocks');
      }

      sub.removeAllListeners();
    }

    // Block all payments with zero pending payments allowed
    {
      // Start from a clean state
      await deleteForwardingReputations({lnd});

      // Make sure payments work normally
      await asyncRetry({interval, times}, async () => {
        await generate({});

        await pay({
          lnd,
          request: (await createInvoice({tokens, lnd: remote.lnd})).request,
        });
      });

      // Stop payments
      const sub = enforceForwardRequestRules({
        lnd: target.lnd,
        max_new_pending_per_hour: 0,
      });

      const rejection = [];

      sub.on('rejected', n => rejection.push(n.reject_reason));

      await generate({});

      // Try to make a payment
      try {
        const payment = await pay({
          lnd,
          request: (await createInvoice({tokens, lnd: remote.lnd})).request,
        });

        strictSame(payment, null, 'No payment should be made');
      } catch (err) {
        strictSame(
          err,
          [503, 'PaymentPathfindingFailedToFindPossibleRoute'],
          'All payments are blocked'
        );
      }

      const [rejected] = rejection;

      strictSame(rejected, 'NoNewHtlcsAccepted', 'All payments blocked now');

      sub.removeAllListeners();
    }

    // New pending payments are limited by hour
    {
      // Start from a clean state
      await deleteForwardingReputations({lnd});

      // Make sure payments work normally
      await asyncRetry({interval, times}, async () => {
        await generate({});

        await pay({
          lnd,
          request: (await createInvoice({tokens, lnd: remote.lnd})).request,
        });
      });

      // Stop payments when there is a pending payment
      const sub = enforceForwardRequestRules({
        lnd: target.lnd,
        max_new_pending_per_hour: 1,
      });

      const rejection = [];

      sub.on('rejected', rejected => rejection.push(rejected));

      // To create a pending payment, remote will hold the HTLC
      const hold = await createHodlInvoice({tokens, lnd: remote.lnd});

      const invoiceSub = subscribeToInvoice({id: hold.id, lnd: remote.lnd});

      // Wait for the HTLC to be held
      invoiceSub.on('invoice_updated', async invoice => {
        if (!invoice.is_held) {
          return;
        }

        // Now that a payment is held, a new payment will be rate limited
        try {
          const payment = await pay({
            lnd,
            request: (await createInvoice({tokens, lnd: remote.lnd})).request,
          });
          strictSame(payment, null, 'Expected no payment can be made');
        } catch (err) {
          strictSame(
            err,
            [503, 'PaymentPathfindingFailedToFindPossibleRoute'],
            'Pending HTLCs block new payments'
          );
        }

        // The rate-limited payment generated a rejection event
        const [rejected] = rejection;

        strictSame(
          rejected.reject_reason,
          'TooManyNewPendingHtlcsInThePastHour',
          'Reason for rejection is too many pending HTLCs'
        );

        // Release the hold to free up a pending slot
        await settleHodlInvoice({lnd: remote.lnd, secret: hold.secret});
      });

      // Pay to the hold invoice
      const payment = await pay({lnd, request: hold.request});

      // After paying the hold invoice, should be able to pay normally again
      await deleteForwardingReputations({lnd});

      // Make a payment to confirm things are back to normal
      await asyncRetry({interval, times}, async () => {
        await pay({
          lnd,
          request: (await createInvoice({tokens, lnd: remote.lnd})).request,
        });
      });

      sub.removeAllListeners();
    }

    // Forwards can only flow in allowed direction
    {
      // Start from a clean state
      await deleteForwardingReputations({lnd});

      // Make sure payments work normally
      await asyncRetry({interval, times}, async () => {
        await generate({});

        await pay({
          lnd,
          request: (await createInvoice({tokens, lnd: remote.lnd})).request,
        });
      });

      // Stop payments when there is a pending payment
      const sub = enforceForwardRequestRules({
        lnd: target.lnd,
        only_allow: [{inbound_peer: remote.id, outbound_peer: id}],
      });

      const rejection = [];

      sub.on('rejected', rejected => rejection.push(rejected));

      // Payments are rejected when not going from remote to control
      try {
        await pay({
          lnd,
          request: (await createInvoice({tokens, lnd: remote.lnd})).request,
        });

        strictSame(payment, null, 'Expected that control to remote blocked');
      } catch (err) {
        strictSame(
          err,
          [503, 'PaymentPathfindingFailedToFindPossibleRoute'],
          'Control to remote payments blocked'
        );
      }

      // Payments from remote to control does work
      try {
        await asyncRetry({interval, times}, async () => {
          await generate({});

          await pay({
            lnd: remote.lnd,
            request: (await createInvoice({tokens, lnd})).request,
          });
        });
      } catch (err) {
        strictSame(err, null, 'Remote to control should work');
      }

      // A rejection event was generated
      const [rejected] = rejection;

      strictSame(
        rejected.reject_reason,
        'RoutingPairNotDeclaredInOnlyAllowList',
        'Payments are limited by allow list'
      );

      sub.removeAllListeners();

      // After paying the hold invoice, should be able to pay normally again
      await deleteForwardingReputations({lnd});

      // Make a payment to confirm things are back to normal
      await asyncRetry({interval, times}, async () => {
        await pay({
          lnd,
          request: (await createInvoice({tokens, lnd: remote.lnd})).request,
        });
      });
    }

    // Inbound channels can be blocked
    {
      // Make sure payments work normally
      await asyncRetry({interval, times}, async () => {
        await generate({});

        await pay({
          lnd,
          request: (await createInvoice({tokens, lnd: remote.lnd})).request,
        });
      });

      const [{id}] = (await getChannels({lnd})).channels;

      // Stop payments on invalid inbound channel
      const sub = enforceForwardRequestRules({
        lnd: target.lnd,
        stop_channels: [id],
      });

      const rejection = [];

      sub.on('rejected', rejected => rejection.push(rejected));

      // Payment will be rejected
      try {
        const payment = await pay({
          lnd,
          request: (await createInvoice({tokens, lnd: remote.lnd})).request,
        });

        strictSame(payment, null, 'Stop channel should have been blocked');
      } catch (err) {
        strictSame(
          err,
          [503, 'PaymentPathfindingFailedToFindPossibleRoute'],
          'Inbound channels on stop list are rejected'
        );
      }

      const [rejected] = rejection;

      strictSame(
        rejected.reject_reason,
        'InboundChannelDeniedDueToStopList',
        'Failure returns inbound channel block reason'
      );

      sub.removeAllListeners();
    }

    // Outbound channels can be blocked
    {
      // Make sure payments work normally
      await asyncRetry({interval, times}, async () => {
        await generate({});

        // Start from a clean state
        await deleteForwardingReputations({lnd});

        await pay({
          lnd,
          request: (await createInvoice({tokens, lnd: remote.lnd})).request,
        });
      });

      const [{id}] = (await getChannels({lnd: remote.lnd})).channels;

      // Stop payments on invalid outbound channel
      const sub = enforceForwardRequestRules({
        lnd: target.lnd,
        stop_channels: [id],
      });

      const rejection = [];

      sub.on('rejected', rejected => rejection.push(rejected));

      // Payment will be rejected
      try {
        const payment = await pay({
          lnd,
          request: (await createInvoice({tokens, lnd: remote.lnd})).request,
        });

        strictSame(payment, null, 'Stop out channel should have been blocked');
      } catch (err) {
        strictSame(
          err,
          [503, 'PaymentPathfindingFailedToFindPossibleRoute'],
          'Outbound channels on stop list are rejected'
        );
      }

      const [rejected] = rejection;

      strictSame(
        rejected.reject_reason,
        'OutboundChannelDeniedDueToStopList',
        'Failure returns outbound channel block reason'
      );

      sub.removeAllListeners();
    }

    // Deny list will prevent forwarding
    {
      // Start from a clean state
      await deleteForwardingReputations({lnd});

      // Make sure payments work normally
      await asyncRetry({interval, times}, async () => {
        await generate({});

        await pay({
          lnd,
          request: (await createInvoice({tokens, lnd: remote.lnd})).request,
        });
      });

      // Stop payments from control to target
      const sub = enforceForwardRequestRules({
        lnd: target.lnd,
        only_disallow: [{inbound_peer: id, outbound_peer: remote.id}],
      });

      const rejection = [];

      sub.on('rejected', rejected => rejection.push(rejected));

      // Payments are rejected when going from control to remote
      try {
        await pay({
          lnd,
          request: (await createInvoice({tokens, lnd: remote.lnd})).request,
        });

        strictSame(payment, null, 'Expected that control to remote denied');
      } catch (err) {
        strictSame(
          err,
          [503, 'PaymentPathfindingFailedToFindPossibleRoute'],
          'Control to remote payments denied'
        );
      }

      // Payments from remote to control does work
      try {
        await asyncRetry({interval, times}, async () => {
          await generate({});

          await pay({
            lnd: remote.lnd,
            request: (await createInvoice({tokens, lnd})).request,
          });
        });
      } catch (err) {
        strictSame(err, null, 'Remote to control should not be denied');
      }

      // A rejection event was generated
      const [rejected] = rejection;

      strictSame(
        rejected.reject_reason,
        'RoutingPairSpecifiedInDenyForwardsList',
        'Payments are limited by deny list'
      );

      sub.removeAllListeners();

      // After paying the hold invoice, should be able to pay normally again
      await deleteForwardingReputations({lnd});

      // Make a payment to confirm things are back to normal
      await asyncRetry({interval, times}, async () => {
        await pay({
          lnd,
          request: (await createInvoice({tokens, lnd: remote.lnd})).request,
        });
      });
    }
  } catch (err) {
    strictSame(err, null, 'Expected no error');
  } finally {
    await kill({});

    return end();
  }
});
