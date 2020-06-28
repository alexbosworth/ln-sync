const asyncAuto = require('async/auto');
const {returnResult} = require('asyncjs-util');

const keyForRecord = require('./key_for_record');

const fresh = ['id'];
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const table = 'blocks';
const type = 'block';

/** Sync a block

  {
    db: {
      getItem: <Get Item Function>
      putItem: <Put Item Function>
    }
    height: <Block Chain Height Number>
    id: <Block Hash Hex String>
  }

  @returns via cbk or Promise
  {
    [created]: {
      height: <Block Chain Height Number>
      id: <Block Hash Buffer Object>
    }
  }
*/
module.exports = ({db, height, id}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!db) {
          return cbk([400, 'ExpectedDatabaseToSyncBlock']);
        }

        if (!height) {
          return cbk([400, 'ExpectedBlockHeightToSyncBlock']);
        }

        if (!id) {
          return cbk([400, 'ExpectedBlockHashToSyncBlock']);
        }

        return cbk();
      },

      // Record key
      key: ['validate', ({}, cbk) => cbk(null, keyForRecord({id, type}).key)],

      // Get the stored record
      getStored: ['key', ({key}, cbk) => db.getItem({key, table}, cbk)],

      // Create the record
      create: ['getStored', 'key', ({getStored, key}, cbk) => {
        // Exit early when there is already a stored record
        if (!!getStored.record) {
          return cbk(null, {});
        }

        const record = {height, id: hexAsBuffer(id)};

        return db.putItem({fresh, key, record, table}, err => {
          if (!!err) {
            return cbk(err);
          }

          return cbk(null, {created: record});
        });
      }],
    },
    returnResult({reject, resolve, of: 'create'}, cbk));
  });
};
