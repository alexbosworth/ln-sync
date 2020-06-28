const asyncAuto = require('async/auto');
const {returnResult} = require('asyncjs-util');

const keyForRecord = require('./key_for_record');

const bufferAsHex = buffer => buffer.toString('hex');
const table = 'channels';
const type = 'channel';

/** Mark a channel as closed if it is not already closed

  {
    db: {
      getItem: <Get Item Function>
      updateItem: <Update Item Function>
    }
    height: <Channel Close Height Number>
    id: <Standard Format Channel Id String>
  }

  @returns via cbk or Promise
  {
    [is_closed]: <Channel Marked as Closed Bool>
    public_keys: [<Public Key Hex String>]
  }
*/
module.exports = ({db, height, id}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!db) {
          return cbk([400, 'ExpectedDatabaseToMarkChannelClosed']);
        }

        if (!height) {
          return cbk([400, 'ExpectedHeightToMarkChannelClosed']);
        }

        if (!id) {
          return cbk([400, 'ExpectedIdToMarkChannelClosed']);
        }

        return cbk();
      },

      // Record key
      key: ['validate', ({}, cbk) => cbk(null, keyForRecord({id, type}).key)],

      // Get the current state of the channel
      getStored: ['key', ({key}, cbk) => db.getItem({key, table}, cbk)],

      // Update the record
      update: ['getStored', 'key', ({getStored, key}, cbk) => {
        // Exit early when there is no stored record or it's already closed
        if (!getStored.record || !!getStored.record.close_height) {
          return cbk();
        }

        return db.updateItem({
          key,
          table,
          changes: {close_height: {set: height}},
          expect: {_rev: getStored.record._rev},
        },
        cbk);
      }],

      // Channel marked as closed
      updated: ['getStored', 'update', ({getStored}, cbk) => {
        // Exit early when there is no stored record or it's already closed
        if (!getStored.record || !!getStored.record.close_height) {
          return cbk(null, {});
        }

        return cbk(null, {
          is_closed: true,
          public_keys: getStored.record.public_keys.map(bufferAsHex),
        });
      }],
    },
    returnResult({reject, resolve, of: 'updated'}, cbk));
  });
};
