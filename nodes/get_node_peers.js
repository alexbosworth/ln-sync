const asyncAuto = require('async/auto');
const {returnResult} = require('asyncjs-util');

const bufferAsHex = buffer => buffer.toString('hex');
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const table = 'peers';

/** Get the set of peers for a node

  {
    db: <Database Object>
    id: <Public Key Hex String>
  }

  @returns via cbk or Promise
  {
    peers: [{
      features: [<BOLT 09 Feature Bit Number>]
      is_connected: <Is Connected Bool>
      is_inbound: <Is Inbound Peer Bool>
      [is_sync_peer]: <Is Syncing Graph Data Bool>
      public_key: <Public Key Hex String>
      socket: <Network Address And Port String>
    }]
  }
*/
module.exports = ({db, id}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!db) {
          return cbk([400, 'ExpectedDatabaseToGetNodePeers']);
        }

        if (!id) {
          return cbk([400, 'ExpectedNodeIdToGetNodePeers']);
        }

        return cbk();
      },

      // Get the stored records
      getStored: ['validate', ({}, cbk) => {
        return db.query({table, where: {from: {eq: hexAsBuffer(id)}}}, cbk);
      }],

      // Format the records as peers
      peers: ['getStored', ({getStored}, cbk) => {
        const peers = getStored.records.map(({record}) => {
          return {
            features: record.features,
            is_connected: record.is_connected,
            is_inbound: record.is_inbound,
            is_sync_peer: record.is_sync_peer,
            public_key: bufferAsHex(record.public_key),
            socket: record.socket,
          };
        });

        return cbk(null, {peers});
      }],
    },
    returnResult({reject, resolve, of: 'peers'}, cbk));
  });
};
