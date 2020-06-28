const asyncAuto = require('async/auto');
const asyncEachSeries = require('async/eachSeries');
const asyncRetry = require('async/retry');
const {getNetworkGraph} = require('ln-service');
const {getPeers} = require('ln-service');
const {returnResult} = require('asyncjs-util');

const {shuffle} = require('./../arrays');
const syncChannel = require('./sync_channel');
const syncChannelPolicy = require('./sync_channel_policy');
const syncNode = require('./sync_node');
const syncPeer = require('./sync_peer');

const conflictError = 409;
const flatten = arr => [].concat(...arr);
const interval = () => Math.round(Math.random() * 1e4);
const {isArray} = Array;
const times = 1e3;

/** Sync records from a node into the database

  {
    db: <Database Object>
    lnd: <Authenticated LND API Object>
  }
*/
module.exports = ({db, lnd}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!db) {
          return cbk([400, 'ExpectedDbToSyncCurrentRecords']);
        }

        if (!lnd) {
          return cbk([400, 'ExpectedLndToSyncCurrentRecords']);
        }

        return cbk();
      },

      // Get the network graph
      getGraph: ['validate', ({}, cbk) => getNetworkGraph({lnd}, cbk)],

      // Get the connected peers
      getPeers: ['validate', ({}, cbk) => getPeers({lnd}, cbk)],

      // Channels to sync
      channels: ['getGraph', ({getGraph}, cbk) => {
        return cbk(null, shuffle({array: getGraph.channels}).shuffled);
      }],

      // Node public keys to sync
      nodes: ['getGraph', ({getGraph}, cbk) => {
        const array = getGraph.nodes.map(n => n.public_key);

        return cbk(null, shuffle({array}).shuffled);
      }],

      // Policies to sync
      policies: ['getGraph', ({getGraph}, cbk) => {
        const array = flatten(getGraph.channels.map(channel => {
          return channel.policies.map(policy => {
            return {channel: channel.id, public_key: policy.public_key};
          });
        }));

        return cbk(null, shuffle({array}).shuffled);
      }],

      // Make sure every channel is in sync
      syncChannels: ['channels', ({channels}, cbk) => {
        return asyncEachSeries(channels, ({id}, cbk) => {
          return asyncRetry({interval, times}, cbk => {
            return syncChannel({db, id, lnd}, cbk);
          },
          cbk);
        },
        cbk);
      }],

      // Make sure every node is in sync
      syncNodes: ['nodes', ({nodes}, cbk) => {
        return asyncEachSeries(nodes, (id, cbk) => {
          return asyncRetry({interval, times}, cbk => {
            return syncNode({db, id, lnd}, cbk);
          },
          cbk);
        },
        cbk);
      }],

      // Keep the set of peers in sync
      syncPeers: ['getPeers', ({getPeers}, cbk) => {
        return asyncEachSeries(getPeers.peers, (peer, cbk) => {
          return asyncRetry({interval, times}, cbk => {
            return syncPeer({db, lnd, id: peer.public_key}, cbk);
          },
          cbk);
        },
        cbk);
      }],

      // Make sure every policy is in sync
      syncPolicies: ['policies', ({policies}, cbk) => {
        return asyncEachSeries(policies, (policy, cbk) => {
          return asyncRetry({interval, times}, cbk => {
            return syncChannelPolicy({
              db,
              lnd,
              id: policy.channel,
              public_key: policy.public_key,
            },
            cbk);
          },
          cbk);
        },
        cbk);
      }],
    },
    returnResult({reject, resolve}, cbk));
  });
};
