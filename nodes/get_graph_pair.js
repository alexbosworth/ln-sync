const asyncAuto = require('async/auto');
const asyncMap = require('async/map');
const {returnResult} = require('asyncjs-util');

const getGraphNode = require('./get_graph_node');
const {keyForRecord} = require('./../sync');

const bufferAsHex = buffer => buffer.toString('hex');
const {isArray} = Array;
const {isBuffer} = Buffer;
const pairCount = 2;
const table = 'channels';
const type = 'channel';

/** Get a pair of nodes

  {
    db: <Database Object>
    id: <Channel Id String>
  }

  @returns via cbk or Promise
  {
    [channel]: {
      [capacity]: <Channel Capacity Tokens Number>
    }
    [pair]: {
      nodes: [{
        alias: <Alias String>
        id: <Node Public Hex String>
      }]
    }
  }
*/
module.exports = ({db, id}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!db) {
          return cbk([400, 'ExpectedDatabaseToGetGraphPair']);
        }

        if (!id) {
          return cbk([400, 'ExpectedChannelIdToGetGraphPair']);
        }

        return cbk();
      },

      // Derive the key for the row
      key: ['validate', ({}, cbk) => cbk(null, keyForRecord({id, type}).key)],

      // Get the stored record
      getStored: ['key', ({key}, cbk) => db.getItem({key, table}, cbk)],

      // Get channel public keys
      ids: ['getStored', ({getStored}, cbk) => {
        const {record} = getStored;

        if (!record || !isArray(record.public_keys)) {
          return cbk();
        }

        if (record.public_keys.length !== pairCount) {
          return cbk();
        }

        if (record.public_keys.map(n => !isBuffer(n)).includes(true)) {
          return cbk();
        }

        return cbk(null, record.public_keys.map(bufferAsHex));
      }],

      // Get the node details
      getNodes: ['ids', ({ids}, cbk) => {
        if (!ids) {
          return cbk();
        }

        return asyncMap(ids, (id, cbk) => getGraphNode({db, id}, cbk), cbk);
      }],

      // Pair of nodes
      pair: ['getNodes', 'getStored', ({getNodes, getStored}, cbk) => {
        if (!getNodes) {
          return cbk(null, {});
        }

        return cbk(null, {
          channel: {capacity: getStored.record.capacity},
          pair: {nodes: getNodes.map(n => ({alias: n.alias, id: n.id}))},
        });
      }],
    },
    returnResult({reject, resolve, of: 'pair'}, cbk));
  });
};
