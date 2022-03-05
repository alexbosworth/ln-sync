const asyncAuto = require('async/auto');
const {getPeers} = require('ln-service');
const {returnResult} = require('asyncjs-util');
const {subscribeToPeers} = require('ln-service');

const defaultTimeoutMs = 1000 * 60 * 3;
const isPublicKey = n => !!n && /^[0-9A-F]{66}$/i.test(n);

/** Wait for a peer to connect

  {
    id: <Node Identity Public Key Hex String>
    lnd: <Authenticated LND API Object>
    [timeout]: <Timeout Milliseconds Number>
  }

  @returns via cbk or Promise
*/
module.exports = ({id, lnd, timeout}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!isPublicKey(id)) {
          return cbk([400, 'ExpectedIdentityPublicKeyToWaitForConnection']);
        }

        if (!lnd) {
          return cbk([400, 'ExpectedAuthenticatedLndToWaitForConnection']);
        }

        return cbk();
      },

      // Get the list of currently connected peers
      getPeers: ['validate', ({}, cbk) => getPeers({lnd}, cbk)],

      // Subscribe to peers
      subscribe: ['getPeers', ({getPeers}, cbk) => {
        // Exit early when peer is already connected
        if (getPeers.peers.find(n => n.public_key === id)) {
          return cbk();
        }

        const sub = subscribeToPeers({lnd});

        // Avoid waiting indefinitely, unsubscribe after a timeout
        const timer = setTimeout(() => {
          sub.on('error', () => {});

          sub.removeAllListeners();

          return cbk();
        },
        timeout || defaultTimeoutMs);

        const done = err => {
          clearTimeout(timer);

          sub.removeAllListeners();

          return cbk(err);
        };

        // Listen for connecting peers
        sub.on('connected', connected => {
          // Connecting peer must have specified identity public key
          if (connected.public_key !== id) {
            return;
          }

          return done();
        });

        sub.on('error', err => {
          return done([503, 'UnexpectedErrorWaitingForPeer', {err}]);
        });

        return;
      }],

      // Get updated peers list
      getUpdatedPeersList: ['subscribe', ({}, cbk) => getPeers({lnd}, cbk)],

      // Check peer is connected
      checkConnected: ['getUpdatedPeersList', ({getUpdatedPeersList}, cbk) => {
        const connected = getUpdatedPeersList.peers.map(n => n.public_key);

        // The set of connected peers should contain specified node id
        if (!connected.includes(id)) {
          return cbk([504, 'FailedToFindConnectedPeer']);
        }

        return cbk();
      }],
    },
    returnResult({reject, resolve}, cbk));
  });
};
