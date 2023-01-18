const EventEmitter = require('events');

const asyncMap = require('async/map');
const {decodeChanId} = require('bolt07');
const {getChannel} = require('ln-service');
const {getWalletInfo} = require('ln-service');
const {subscribeToBlocks} = require('ln-service');
const {subscribeToForwardRequests} = require('ln-service');
const {subscribeToForwards} = require('ln-service');

const htlcId = n => [n.in_channel, n.in_payment, n.out_channel, n.out_payment];
const {isArray} = Array;
const {keys} = Object;
const max = arr => Math.max(...arr);
const noHtlcsAllowed = 0;
const secondsAgoDate = n => new Date(Date.now() - (1000 * n)).toISOString();
const secondsPerHour = 60 * 60;

/** Enforce forward request rules

  Defining `only_allow` will setup an exclusive allowed list of peers or pairs
  Defining `only_disallow` will setup an exclusive ban list of peers or pairs

  {
    lnd: <Authenticated LND API Object>
    [max_new_pending_per_hour]: <Max Per Hour New Pending Forwards Number>
    [max_seconds_since_last_block]: <Max Seconds Since Last New Block Number>
    [min_activation_age]: <Minimum Confirmed Blocks For Routing Channel Number>
    [only_allow]: [{
      inbound_peer: <Only Allow Inbound Peer Public Key Hex String>
      outbound_peer: <Only Allow Outbound Peer Public Key Hex String>
    }]
    [only_disallow]: [{
      inbound_peer: <Only Disallow Inbound Peer Public Key Hex String>
      outbound_peer: <Only Disallow Outbound Peer Public Key Hex String>
    }]    
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
  if (!!args.only_allow && !!args.only_disallow) {
    throw new Error('ExpectedEitherAllowOrDisallowPairsToEnforceForwardRequestRules');
  }

  if (!!args.only_allow && !isArray(args.only_allow)) {
    throw new Error('ExpectedArrayOfOnlyAllowPairs');
  }

  if (!!args.only_disallow && !isArray(args.only_disallow)) {
    throw new Error('ExpectedArrayOfOnlyDisallowPairs');
  }

  if (!!args.only_allow && !args.only_allow.length) {
    throw new Error('ExpectedOnlyAllowPairsToEnforceForwardRequestRules');
  }

  if (!!args.only_disallow && !args.only_disallow.length) {
    throw new Error('ExpectedOnlyDisallowPairsToEnforceForwardRequestRules');
  }

  if (!args.lnd) {
    throw new Error('ExpectedLndToEnforceForwardRequestRules');
  }

  const chain = {};
  const channelKeys = {};
  const emitter = new EventEmitter();
  const htlcs = {};
  const isChain = args.max_seconds_since_last_block || args.min_activation_age;
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

  // Keep track of blocks when there is a blockchain constraint
  if (!!isChain) {
    const subBlocks = subscribeToBlocks({lnd: args.lnd});

    // Update the latest block time every block
    subBlocks.on('block', async ({height}) => {
      chain.current_block_height = height;

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

    // When enforcing chain based rules make sure chain info is present
    if (!!isChain && !chain.latest_block_at) {
      try {
        const walletInfo = await getWalletInfo({lnd: args.lnd});

        chain.current_block_height = walletInfo.current_block_height;
        chain.latest_block_at = walletInfo.latest_block_at;
      } catch (err) {
        // Make sure to resolve the HTLC before quitting
        reject('FailedToGetWalletInfoForChainConstraints');

        return emitError([503, 'FailedToGetWalletInfoForChainConstraints']);
      }
    }

    // Make sure that only explicitly specified edges allow routing
    if (!!isArray(args.only_allow) || !!isArray(args.only_disallow)) {
      const edges = [request.in_channel, request.out_channel];

      try {
        const [inKeys, outKeys] = await asyncMap(edges, async (id) => {
          // Exit early when the channel keys are cached
          if (!!channelKeys[id]) {
            return channelKeys[id];
          }

          const {policies} = await getChannel({id, lnd: args.lnd});

          const keys = policies.map(n => n.public_key);

          // Cache the associated keys with this channel id
          channelKeys[id] = keys

          return keys;
        });

        const [inKey1, inKey2] = inKeys;
        const [outKey1, outKey2] = outKeys;

        const inKey = !outKeys.includes(inKey1) ? inKey1 : inKey2;
        const outKey = inKeys.includes(outKey1) ? outKey2 : outKey1;

        // Look for this pairing in the allow/disallow list
        const isAllowed = () => {
          if (!!isArray(args.only_allow)) {
            const isAllowCheck = !!args.only_allow.find(rule => {
              return rule.inbound_peer === inKey && rule.outbound_peer === outKey;
            });

            return isAllowCheck;
          }

          if (!!isArray(args.only_disallow)) {
            const isAllowCheck = !!args.only_disallow.find(rule => {
              return rule.inbound_peer === inKey && rule.outbound_peer === outKey;
            });

            return !isAllowCheck;
          }
        }

        // Block the forward when not explicitly allowed
        if (!isAllowed()) {
          return reject('RoutingPairNotDeclaredInOnlyAllow/DisallowList');
        }
      } catch (err) {
        return reject('FailedToFindChannelDetailsForReferencedChannel');
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

    // Enforce minimum activation blocks constraint
    if (!!args.min_activation_age) {
      // Forwards must be confirmed before at least this block to be accepted
      const maxHeight = chain.current_block_height - args.min_activation_age;

      // Convert the channel ids into funding outpoint confirmation heights
      const heights = [request.in_channel, request.out_channel].map(id => {
        return decodeChanId({channel: id}).block_height;
      });

      // Reject HTLCs when a channel involved is too new
      if (max(heights) > maxHeight) {
        return reject('WaitingForChannelConfirmationActivation');
      }
    }

    // No rules have been violated
    return request.accept();
  });

  return emitter;
};
