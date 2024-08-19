const {addPeer} = require('ln-service');
const asyncAuto = require('async/auto');
const asyncDetectSeries = require('async/detectSeries');
const {getNode} = require('ln-service');
const {getPeers} = require('ln-service');
const {returnResult} = require('asyncjs-util');

const defaultRetryDelayMs = 1;
const {isArray} = Array;
const isPublicKey = n => !!n && /^[0-9A-F]{66}$/i.test(n);

/** Connect a peer

  {
    id: <Node Public Key Hex String>
    lnd: <Authenticated LND API Object>
    [sockets]: [<Host Network Address And Optional Port String>]
  }

  @returns via cbk or Promise
*/
module.exports = ({id, lnd, sockets}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!isPublicKey(id)) {
          return cbk([400, 'ExpectedNodePublicKeyToConnectAsPeer']);
        }

        if (!lnd) {
          return cbk([400, 'ExpectedAuthenticatedLndToConnectPeer']);
        }

        if (!!sockets && (!isArray(sockets) || !sockets.length)) {
          return cbk([400, 'ExpectedNonEmptyArrayOfSocketsToConnectAsPeer']);
        }

        return cbk();
      },

      // Get already connected peers to see if the peer is already connected
      getPeers: ['validate', ({}, cbk) => getPeers({lnd}, cbk)],

      // Determine if the peer is already connected
      isConnected: ['getPeers', ({getPeers}, cbk) => {
        return cbk(null, getPeers.peers.map(n => n.public_key).includes(id));
      }],

      // Get the sockets to connect to the node
      getSockets: ['isConnected', ({isConnected}, cbk) => {
        // Exit early when node is already connected as a peer
        if (!!isConnected) {
          return cbk();
        }

        // Exit early when sockets are already specified
        if (!!sockets) {
          return cbk(null, {sockets: sockets.map(socket => ({socket}))});
        }

        return getNode({
          lnd,
          is_omitting_channels: true,
          public_key: id,
        },
        cbk);
      }],

      // Connect to the node if not already connected
      connect: ['getSockets', ({getSockets}, cbk) => {
        // Exit early when there are no sockets to connect to
        if (!getSockets) {
          return cbk();
        }

        if (!getSockets.sockets.length) {
          return cbk([404, 'NoKnownSocketsForNodeToConnectTo']);
        }

        return asyncDetectSeries(getSockets.sockets, ({socket}, cbk) => {
          return addPeer({
            lnd,
            socket,
            public_key: id,
            retry_delay: defaultRetryDelayMs,
          },
          err => cbk(null, !err));
        },
        (err, res) => {
          // When none of the sockets work, return a failure
          if (!res) {
            return cbk([503, 'FailedToConnectToPeer']);
          }

          return cbk();
        });
      }],
    },
    returnResult({reject, resolve}, cbk));
  });
};
