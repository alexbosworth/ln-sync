const asyncAuto = require('async/auto');
const asyncUntil = require('async/until');
const {getChannels} = require('ln-service');
const {returnResult} = require('asyncjs-util');
const {subscribeToForwardRequests} = require('ln-service');

const {isArray} = Array;
const stopHtlcsIntervalMs = 3000;

/** Stop all HTLCs with a peer until a channel disappears

  {
    id: <Standard Format Channel Id To Close String>
    ids: [<Standard Format Channel Id With Peer String>]
    lnd: <Authenticated LND API Object>
    peer: <Peer Public Key Hex Encoded String>
  }

  @returns via cbk or Promise
*/
module.exports = ({id, ids, lnd, peer}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!id) {
          return cbk([400, 'ExpectedChannelIdToStopHtlcsFor']);
        }

        if (!isArray(ids)) {
          return cbk([400, 'ExpectedArrayOfChannelIdsToStopAllHtlcs']);
        }

        if (!lnd) {
          return cbk([400, 'ExpectedAuthenticatedLndToStopAllHtlcs']);
        }

        if (!peer) {
          return cbk([400, 'ExpectedPeerToStopAllHtlcsWith']);
        }

        return cbk();
      },

      // Stop HTLCs
      stop: ['validate', ({}, cbk) => {
        const block = [];
        const state = {has_channel: true};
        const sub = subscribeToForwardRequests({lnd});

        ids.forEach(id => block.push(id));

        sub.on('forward_request', request => {
          // Do not allow forwards inbound from the peer
          if (block.includes(request.in_channel)) {
            return request.reject({});
          }

          // Do not allow forwards outbound to the peer
          if (block.includes(request.out_channel)) {
            return request.reject({});
          }

          // Don't touch forwards on other peers
          return request.accept({});
        });

        return asyncUntil(
          cbk => cbk(null, !state.has_channel),
          cbk => {
            return getChannels({lnd, partner_public_key: peer}, (err, res) => {
              if (!!err) {
                return cbk(err);
              }

              // Add new channels to the block list
              res.channels.forEach(channel => {
                // Exit early when the channel is already blocked
                if (block.includes(channel.id)) {
                  return;
                }

                return block.push(channel.id);
              });

              const channels = res.channels.map(n => n.id);

              state.has_channel = channels.includes(id);

              // Exit early when the channel is still there
              if (!!state.has_channel) {
                return setTimeout(cbk, stopHtlcsIntervalMs);
              }

              // Stop blocking forwards
              sub.removeAllListeners();

              return cbk();
            });
          },
          cbk
        );
      }],
    },
    returnResult({reject, resolve}, cbk));
  });
};
