const EventEmitter = require('events');

const {getWalletInfo} = require('ln-service');
const {subscribeToBlocks} = require('ln-service');
const {subscribeToForwardRequests} = require('ln-service');
const {subscribeToForwards} = require('ln-service');

const htlcId = n => [n.in_channel, n.in_payment, n.out_channel, n.out_payment];
const {keys} = Object;
const noHtlcsAllowed = 0;
const secondsAgoDate = n => new Date(Date.now() - (1000 * n)).toISOString();
const secondsPerHour = 60 * 60;

/** Enforce forward request rules

  {
    lnd: <Authenticated LND API Object>
    [max_new_pending_per_hour]: <Max Per Hour New Pending Forwards Number>
    [max_seconds_since_last_block]: <Max Seconds Since Last New Block Number>
  }

  @event 'rejected'
  {
    in_channel: <Inbound Standard Format Channel Id String>
    out_channel: <Requested Outbound Channel Standard Format Id String>
    reject_reason: <Rejection Reason String>
  }

  @returns
  <Forward Request Enforcement EventEmitter Object>
*/
module.exports = args => {
  if (!args.lnd) {
    throw new Error('ExpectedLndToEnforceForwardRequestRules');
  }

  const chain = {};
  const emitter = new EventEmitter();
  const htlcs = {};
  const subs = [];

  // When nothing is listening to the events, stop listening to forward reqs
  emitter.on('removeListener', () => {
    // Exit early when there are still listeners
    if (emitter.listenerCount('rejected')) {
      return;
    }

    // Remove all attached subscriptions
    return subs.forEach(n => n.removeAllListeners());
  });

  // Stop everything if there is an error
  const emitError = err => {
    // Remove all attached subscriptions
    subs.forEach(n => n.removeAllListeners());

    return emitter.emit('error', err);
  };

  // Keep track of block timing when there is a block timing constraint
  if (!!args.max_seconds_since_last_block) {
    const subBlocks = subscribeToBlocks({lnd: args.lnd});

    // Update the latest block time every block
    subBlocks.on('block', async () => {
      // Skip updating the latest block on the first block notification
      if (!chain.latest_block_at) {
        try {
          const wallet = await getWalletInfo({lnd: args.lnd});

          return chain.latest_block_at = wallet.latest_block_at;
        } catch (err) {
          return emitError(err);
        }
      }

      return chain.latest_block_at = new Date().toISOString();
    });

    subBlocks.on('error', err => {
      return emitError([503, 'UnexpectedErrorInBlocksSubscription', {err}]);
    });

    subs.push(subBlocks);
  }

  // Keep track of HTLCs when there is an HTLC rate constraint
  if (!!args.max_new_pending_per_hour) {
    const subForwards = subscribeToForwards({lnd: args.lnd});

    subForwards.on('error', err => emitError(err));

    subForwards.on('forward', htlc => {
      // Ignore HTLCs that don't have an inbound channel
      if (!htlc.in_channel || !htlc.in_payment) {
        return;
      }

      // Ignore HTLCs that don't have an outbound channel
      if (!htlc.out_channel || !htlc.out_payment) {
        return;
      }

      // Forwarding HTLCs are identified by their channels and HTLC indexes
      const id = htlcId(htlc).join();

      // Exit early and remove the pending HTLC when resolved
      if (htlc.is_confirmed || htlc.is_failed) {
        return delete htlcs[id];
      }

      // Record the time of this HTLC
      return htlcs[id] = htlc.at;
    });

    subs.push(subForwards);
  }

  const subForwardRequests = subscribeToForwardRequests({lnd: args.lnd});

  subs.push(subForwardRequests);

  subForwardRequests.on('error', err => {
    return emitError([503, 'UnexpectedErrorInForwardInterceptor', {err}]);
  });

  subForwardRequests.on('forward_request', async request => {
    const reject = reason => {
      emitter.emit('rejected', {
        in_channel: request.in_channel,
        out_channel: request.out_channel,
        reject_reason: reason,
      });

      return request.reject();
    };

    // If enforcing max time since last block, make sure this time is present
    if (!!args.max_seconds_since_last_block && !chain.latest_block_at) {
      try {
        const walletInfo = await getWalletInfo({lnd: args.lnd});

        chain.latest_block_at = walletInfo.latest_block_at;
      } catch (err) {
        // Make sure to resolve the HTLC before quitting
        reject('FailedToGetWalletInfoForMaxSecondsRule');

        return emitError([503, 'FailedToGetWalletInfoForMaxSecondsRule']);
      }
    }

    // Enforce a rule that we must have a recent block
    if (!!args.max_seconds_since_last_block) {
      const oldest = secondsAgoDate(args.max_seconds_since_last_block);

      if (chain.latest_block_at < oldest) {
        return reject('LastBlockReceivedTooLongAgo');
      }
    }

    // Block all HTLCs when no pending forwards allowed
    if (args.max_new_pending_per_hour === noHtlcsAllowed) {
      return reject('NoNewHtlcsAccepted');
    }

    // Enforce maximum new pending forwards per hour rule
    if (!!args.max_new_pending_per_hour) {
      const after = secondsAgoDate(secondsPerHour);

      // Look for HTLCs that were last updated in the time frame
      const pendingCount = keys(htlcs).filter(n => htlcs[n] > after).length;

      if (pendingCount >= args.max_new_pending_per_hour) {
        return reject('TooManyNewPendingHtlcsInThePastHour');
      }
    }

    // No rules have been violated
    return request.accept();
  });

  return emitter;
};
