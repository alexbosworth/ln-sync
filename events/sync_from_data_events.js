const asyncAuto = require('async/auto');
const {getWalletInfo} = require('ln-service');
const {returnResult} = require('asyncjs-util');

const emitError = require('./emit_error');
const eventBlockMined = require('./event_block_mined');
const eventChannelActive = require('./event_channel_active');
const eventChannelClosed = require('./event_channel_closed');
const eventCreateChannel = require('./event_create_channel');
const eventForwardHtlc = require('./event_forward_htlc');
const eventNodeUpdated = require('./event_node_updated');
const eventPaymentHtlc = require('./event_payment_htlc');
const eventPeerConnection = require('./event_peer_connection');
const eventPolicyUpdated = require('./event_policy_updated');
const eventReceiveHtlc = require('./event_receive_htlc');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const flutterDelayMs = 1000 * 90;
const peerConnectionEvents = ['connected', 'disconnected'];

/** Keep the local db using data event streams

  {
    channels: <Local Channels Subscription EventEmitter Object>
    db: <Database Object>
    emitter: <Changes EventEmitter Object>
    forwards: <HTLCs Subscription EventEmitter Object>
    graph: <Network Graph Subscription EventEmitter Object>
    lnd: <Authenticated LND API Object>
  }

  @returns via cbk or Promise
*/
module.exports = (args, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!args.channels) {
          return cbk([400, 'ExpectedChannelsToSyncFromDataEvents']);
        }

        if (!args.db) {
          return cbk([400, 'ExpectedDbToSyncFromDataEvents']);
        }

        if (!args.emitter) {
          return cbk([400, 'ExpectedEmitterToSyncFromDataEvents']);
        }

        if (!args.forwards) {
          return cbk([400, 'ExpectedForwardsToSyncFromDataEvents']);
        }

        if (!args.graph) {
          return cbk([400, 'ExpectedGraphSubscriptionToSyncFromDataEvents']);
        }

        if (!args.lnd) {
          return cbk([400, 'ExpectedLndConnectionToSyncFromDataEvents']);
        }

        return cbk();
      },

      // Get public key
      getPublicKey: ['validate', ({}, cbk) => {
        return getWalletInfo({lnd: args.lnd}, (err, res) => {
          if (!!err) {
            return cbk(err);
          }

          return cbk(null, {public_key: res.public_key});
        });
      }],

      // Create new missing channels as they are announced
      createChannels: ['validate', ({}, cbk) => {
        args.graph.on('channel_updated', async change => {
          try {
            return await eventCreateChannel({
              db: args.db,
              emitter: args.emitter,
              lnd: args.lnd,
              id: change.id,
            });
          } catch (err) {
            return emitError({err, emitter: args.emitter});
          }
        });
      }],

      // Mark channels as closed
      markClosed: ['validate', ({}, cbk) => {
        args.graph.on('channel_closed', async change => {
          try {
            return await eventChannelClosed({
              capacity: change.capacity,
              db: args.db,
              emitter: args.emitter,
              height: change.close_height,
              id: change.id,
            });
          } catch (err) {
            return emitError({err, emitter: args.emitter});
          }
        });
      }],

      // Sync channels
      syncChannels: ['getPublicKey', ({getPublicKey}, cbk) => {
        args.channels.on('channel_active_changed', async change => {
          await delay(flutterDelayMs);

          try {
            return await eventChannelActive({
              db: args.db,
              emitter: args.emitter,
              lnd: args.lnd,
              public_key: getPublicKey.public_key,
              transaction_id: change.transaction_id,
              transaction_vout: change.transaction_vout,
            });
          } catch (err) {
            return emitError({err, emitter: args.emitter});
          }
        });
      }],

      // Sync forward HTLCs
      syncForwardHtlcs: ['getPublicKey', ({getPublicKey}, cbk) => {
        args.forwards.on('forward', async htlc => {
          // Forward HTLCs must have both an in and an out channel
          if (!htlc.in_channel || !htlc.out_channel) {
            return;
          }

          try {
            return await eventForwardHtlc({
              at: htlc.at,
              db: args.db,
              cltv_delta: htlc.cltv_delta,
              emitter: args.emitter,
              external_failure: htlc.external_failure,
              fee_mtokens: htlc.fee_mtokens,
              in_channel: htlc.in_channel,
              in_payment: htlc.in_payment,
              internal_failure: htlc.internal_failure,
              is_confirmed: htlc.is_confirmed,
              is_failed: htlc.is_failed,
              mtokens: htlc.mtokens,
              out_channel: htlc.out_channel,
              out_payment: htlc.out_payment,
              public_key: getPublicKey.public_key,
              timeout: htlc.timeout,
            });
          } catch (err) {
            return emitError({err, emitter: args.emitter});
          }
        });
      }],

      // Sync node updates
      syncNodes: ['validate', ({}, cbk) => {
        args.graph.on('node_updated', async update => {
          try {
            return await eventNodeUpdated({
              db: args.db,
              emitter: args.emitter,
              id: update.public_key,
              lnd: args.lnd,
            });
          } catch (err) {
            return emitError({err, emitter: args.emitter});
          }
        });
      }],

      // Sync send HTLCs
      syncPaymentHtlcs: ['getPublicKey', ({getPublicKey}, cbk) => {
        args.forwards.on('forward', async htlc => {
          // Payment HTLCs have no in channel
          if (!htlc.is_send || !!htlc.in_channel) {
            return;
          }

          try {
            return await eventPaymentHtlc({
              at: htlc.at,
              db: args.db,
              emitter: args.emitter,
              is_confirmed: htlc.is_confirmed,
              is_failed: htlc.is_failed,
              mtokens: htlc.mtokens,
              out_channel: htlc.out_channel,
              out_payment: htlc.out_payment,
              public_key: getPublicKey.public_key,
              timeout: htlc.timeout,
            });
          } catch (err) {
            return emitError({err, emitter: args.emitter});
          }
        });
      }],

      // Sync channel policies
      syncPolicies: ['getPublicKey', ({getPublicKey}, cbk) => {
        args.graph.on('channel_updated', async change => {
          try {
            return await eventPolicyUpdated({
              db: args.db,
              emitter: args.emitter,
              id: change.id,
              lnd: args.lnd,
              public_keys: change.public_keys,
              synced_by: getPublicKey.public_key,
            });
          } catch (err) {
            return emitError({err, emitter: args.emitter});
          }
        });
      }],

      // Sync receive HTLCs
      syncReceiveHtlcs: ['getPublicKey', ({getPublicKey}, cbk) => {
        args.forwards.on('forward', async htlc => {
          // Receive HTLCs only have an in channel
          if (!htlc.is_receive || !!htlc.out_channel) {
            return;
          }

          try {
            await eventReceiveHtlc({
              at: htlc.at,
              db: args.db,
              emitter: args.emitter,
              external_failure: htlc.external_failure,
              in_channel: htlc.in_channel,
              in_payment: htlc.in_payment,
              internal_failure: htlc.internal_failure,
              is_confirmed: htlc.is_confirmed,
              is_failed: htlc.is_failed,
              public_key: getPublicKey.public_key,
            });
          } catch (err) {
            return emitError({err, emitter: args.emitter});
          }
        });
      }],
    },
    returnResult({reject, resolve}, cbk));
  });
};
