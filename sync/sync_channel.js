const asyncAuto = require('async/auto');
const asyncEach = require('async/each');
const {getChannel} = require('lightning/lnd_methods');
const {returnResult} = require('asyncjs-util');

const keyForRecord = require('./key_for_record');
const channelRecord = require('./channel_record');
const channelUpdate = require('./channel_update');
const syncNode = require('./sync_node');

const bufferAsHex = buffer => buffer.toString('hex');
const fresh = ['id'];
const {isArray} = Array;
const table = 'channels';
const type = 'channel';

/** Sync a channel

  {
    db: {
      getItem: <Get Item Function>
      putItem: <Put Item Function>
      updateItem: <Update Item Function>
    }
    id: <Standard Channel Id String>
    lnd: <Authenticated LND API Object>
  }

  @returns via cbk or Promise
  {
    [created]: {
      [capacity]: <Channel Capacity Tokens Number>
      id: <Standard Format Channel Id String>
      public_keys: [<Public Key Hex String>]
      [transaction_id]: <Channel Transaction Id String>
      [transaction_vout]: <Channel Transaction Output Index Number>
    }
  }
*/
module.exports = ({db, id, lnd}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!db) {
          return cbk([400, 'ExpectedDatabaseToSyncChannelPolicy']);
        }

        if (!id) {
          return cbk([400, 'ExpectedIdToSyncChannelPolicy']);
        }

        if (!lnd) {
          return cbk([400, 'ExpectedLndToSyncChannelPolicy']);
        }

        return cbk();
      },

      // Derive the key for the channel row
      key: ['validate', ({}, cbk) => cbk(null, keyForRecord({id, type}).key)],

      // Get the stored channel
      getStored: ['key', ({key}, cbk) => db.getItem({key, table}, cbk)],

      // Get the fresh channel
      getFresh: ['getStored', ({getStored}, cbk) => {
        return getChannel({id, lnd}, (err, res) => {
          if (isArray(err) && err.slice().shift() === 404){
            return cbk();
          }

          if (!!err) {
            return cbk([503, 'UnexpectedErrorGettingChannelToSync', {err}]);
          }

          return cbk(null, res);
        });
      }],

      // Sync nodes of the channel
      syncNodes: ['getFresh', ({getFresh}, cbk) => {
        if (!getFresh) {
          return cbk();
        }

        const keys = getFresh.policies.map(n => n.public_key);

        return asyncEach(keys, (key, cbk) => {
          return syncNode({db, lnd, id: key}, cbk);
        },
        cbk);
      }],

      // Determine creation of the channel
      create: [
        'getFresh',
        'getStored',
        'syncNodes',
        ({getFresh, getStored}, cbk) =>
      {
        // Exit early when the record is already present
        if (!getFresh || !!getStored.record) {
          return cbk();
        }

        try {
          const {record} = channelRecord({channel: getFresh});

          return cbk(null, record);
        } catch (err) {
          return cbk([503, 'FailedToDeriveChannelRecordToSyncChannel', {err}]);
        }
      }],

      // Determine update to the channel
      update: [
        'getFresh',
        'getStored',
        'key',
        ({getFresh, getStored, key}, cbk) =>
      {
        const {record} = getStored;

        // Exit early when there is no stored record
        if (!getFresh || !record) {
          return cbk();
        }

        try {
          const update = channelUpdate({record, channel: getFresh});

          return cbk(null, update);
        } catch (err) {
          return cbk([503, 'UnexpectedErrorDerivingChannelUpdate', {err}]);
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
      updates: ['create', ({create}, cbk) => {
        if (!!create) {
          return cbk(null, {
            created: {
              capacity: create.capacity,
              id: create.id,
              public_keys: create.public_keys.map(n => bufferAsHex(n)),
              transaction_id: create.transaction_id,
              transaction_vout: create.transaction_vout,
            },
          });
        }

        return cbk(null, {});
      }],
    },
    returnResult({reject, resolve, of: 'updates'}, cbk));
  });
};
