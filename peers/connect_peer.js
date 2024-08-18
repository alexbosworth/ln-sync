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
          console.log(sockets)
          return cbk([400, 'ExpectedArrayOfSocketsToConnectAsPeer']);
        }

        return cbk();
      },

      // Get node
      getNodeInfo: ['validate', ({}, cbk) => {
        return getNode({lnd, is_omitting_channels: true, public_key: id}, (err, res) => {
          // Ignore errors, node may not be found
          if (!!err) {
            return cbk();
          }

          return cbk(null, res);
        });
      }],

      // Get already connected peers
      getPeers: ['validate', ({}, cbk) => getPeers({lnd}, cbk)],

      // Get the node sockets if necessary to conneect
      getSockets: ['getNodeInfo', 'getPeers', ({getNodeInfo, getPeers}, cbk) => {
        const isExistingPeer = getPeers.peers.map(n => n.public_key).includes(id);

        // Exit early when there is no need to connect to the node
        if (!!isExistingPeer) {
          return cbk();
        }

        // Exit early when sockets are provided
        if (!!sockets) {
          return cbk(null, {sockets});
        }

        if (!isExistingPeer && !getNodeInfo) {
          return cbk([404, 'FailedToFindNodeToConnectTo']);
        }

        if (!getNodeInfo.sockets.length) {
          return cbk([404, 'FailedToFindNodeToConnectTo']);
        }

        return {sockets: getNodeInfo.sockets.map(n => n.socket)};
      }],

      // Connect to the node if not already connected
      connect: ['getSockets', ({getSockets}, cbk) => {
        // Exit early when there is no node to connect to
        if (!getSockets) {
          return cbk();
        }

        return asyncDetectSeries(getSockets.sockets, (socket, cbk) => {
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
