const asyncAuto = require('async/auto');
const {getPeers} = require('lightning/lnd_methods');
const {getWalletInfo} = require('lightning/lnd_methods');
const {returnResult} = require('asyncjs-util');

const keyForRecord = require('./key_for_record');
const peerUpdate = require('./peer_update');

const add = 1;
const createRecordRev = 0;
const fresh = ['public_key'];
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const idSeparator = ':';
const table = 'peers';
const type = 'peer';

/** Sync peer details

  {
    db: {
      getItem: <Get Item Function>
      putItem: <Put Item Function>
      updateItem: <Update Item Function>
    }
    id: <Node Public Key Hex String>
    lnd: <Authenticated LND API Object>
  }

  @returns via cbk or Promise
  {
    [created]: {
      features: [<BOLT 09 Feature Bit Number>]
      from: <Public Key Buffer Object>
      is_connected: <Is Connected Bool>
      is_inbound: <Is Inbound Peer Bool>
      [is_sync_peer]: <Is Syncing Graph Data Bool>
      public_key: <Public Key Buffer Object>
      socket: <Network Address And Port String>
    }
    [previous]: {
      [features]: [<BOLT 09 Feature Bit Number>]
      [is_connected]: <Is Connected Bool>
      [is_inbound]: <Is Inbound Peer Bool>
      [is_sync_peer]: <Is Syncing Graph Data Bool>
      public_key: <Public Key Hex String>
      [socket]: <Network Address And Port String>
    }
    [updates]: {
      [features]: [<BOLT 09 Feature Bit Number>]
      [is_connected]: <Is Connected Bool>
      [is_inbound]: <Is Inbound Peer Bool>
      [is_sync_peer]: <Is Syncing Graph Data Bool>
      public_key: <Public Key Hex String>
      [socket]: <Network Address And Port String>
    }
  }
*/
module.exports = ({db, id, lnd}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!db) {
          return cbk([400, 'ExpectedDatabaseToSyncPeerDetails']);
        }

        if (!id) {
          return cbk([400, 'ExpectedIdToSyncPeerDetails']);
        }

        if (!lnd) {
          return cbk([400, 'ExpectedLndToSyncPeerDetails']);
        }

        return cbk();
      },

      // Get public key
      getPublicKey: ['validate', ({}, cbk) => getWalletInfo({lnd}, cbk)],

      // Derive the key for the row
      key: ['getPublicKey', ({getPublicKey}, cbk) => {
        // Peer uniqueness is local node to remote node
        const peerId = [getPublicKey.public_key, id].join(idSeparator);

        return cbk(null, keyForRecord({type, id: peerId}).key);
      }],

      // Get the stored record
      getStored: ['key', ({key}, cbk) => db.getItem({key, table}, cbk)],

      // Get the fresh data
      getFresh: ['getStored', ({getStored}, cbk) => {
        // There is no peer lookup method, so get all peers
        return getPeers({lnd}, (err, res) => {
          if (!!err) {
            return cbk(err);
          }

          return cbk(null, res.peers.find(n => n.public_key === id));
        });
      }],

      // Determine creation of the record
      create: [
        'getFresh',
        'getPublicKey',
        'getStored',
        ({getFresh, getPublicKey, getStored}, cbk) =>
      {
        // Exit early when the record is already present or there is no fresh
        if (!getFresh || !!getStored.record) {
          return cbk();
        }

        const record = {
          _rev: createRecordRev,
          features: getFresh.features.map(n => Number(n.bit)),
          from: hexAsBuffer(getPublicKey.public_key),
          is_connected: true,
          is_inbound: getFresh.is_inbound,
          is_sync_peer: getFresh.is_sync_peer,
          public_key: hexAsBuffer(id),
          socket: getFresh.socket,
        };

        return cbk(null, record);
      }],

      // Determine update
      update: [
        'getFresh',
        'getStored',
        'key',
        ({getFresh, getStored, key}, cbk) =>
      {
        const {record} = getStored;

        // Exit early when there is no stored record
        if (!record) {
          return cbk();
        }

        // Exit early when the peer is disconnected
        if (!getFresh && !record.is_connected) {
          return cbk();
        }

        // Exit early when there is no connected peer
        if (!getFresh) {
          return cbk(null, {
            changes: {_rev: {add}, is_connected: {set: false}},
            previous: {is_connected: record.is_connected},
            updates: {is_connected: false},
          });
        }

        try {
          const update = peerUpdate({
            record,
            peer: {
              features: getFresh.features.map(n => Number(n.bit)),
              is_connected: true,
              is_inbound: getFresh.is_inbound,
              is_sync_peer: getFresh.is_sync_peer,
              public_key: id,
              socket: getFresh.socket,
            },
          });

          return cbk(null, update);
        } catch (err) {
          return cbk([503, 'UnexpectedErrorDerivingPeerUpdate', {err}]);
        }
      }],

      // Execute the create to the database
      executeCreate: ['create', 'key', ({create, key}, cbk) => {
        // Exit early when there is no create to execute
        if (!create) {
          return cbk();
        }

        return db.putItem({fresh, key, table, record: create}, cbk);
      }],

      // Execute the update on the database
      executeUpdate: [
        'getStored',
        'key',
        'update',
        ({getStored, key, update}, cbk) =>
      {
        // Exit early when there is nothing to update
        if (!update || !update.changes) {
          return cbk();
        }

        return db.updateItem({
          key,
          table,
          changes: update.changes,
          expect: {_rev: getStored.record._rev},
        },
        cbk);
      }],

      // Result of update
      updates: ['create', 'update', ({create, update}, cbk) => {
        if (!!update && !!update.changes) {
          return cbk(null, {
            previous: {
              features: update.previous.features,
              is_connected: update.previous.is_connected,
              is_inbound: update.previous.is_inbound,
              is_sync_peer: update.previous.is_sync_peer,
              public_key: hexAsBuffer(id),
              socket: update.previous.socket,
            },
            updates: {
              features: update.updates.features,
              is_connected: update.updates.is_connected,
              is_inbound: update.updates.is_inbound,
              is_sync_peer: update.updates.is_sync_peer,
              public_key: hexAsBuffer(id),
              socket: update.updates.socket,
            },
          });
        }

        if (!!create) {
          return cbk(null, {
            created: {
              features: create.features,
              is_connected: create.is_connected,
              is_inbound: create.is_inbound,
              is_sync_peer: create.is_sync_peer,
              public_key: create.public_key,
              socket: create.socket,
            },
          });
        }

        return cbk(null, {});
      }],
    },
    returnResult({reject, resolve, of: 'updates'}, cbk));
  });
};
