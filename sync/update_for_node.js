const asyncAuto = require('async/auto');
const {getNode} = require('lightning/lnd_methods');
const {returnResult} = require('asyncjs-util');

const keyForRecord = require('./key_for_record');
const updatesForNode = require('./updates_for_node');

const table = 'nodes';
const type = 'node';

/** Derive an update for a node record

  {
    db: {
      getItem: <Get Item Function>
    }
    id: <Node Public Key Hex String>
    lnd: <Authenticated LND API Object>
  }

  @returns via cbk
  {
    [update]: {
    }
  }
*/
module.exports = ({db, id, lnd}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!db) {
          return cbk([400, 'ExpectedDatabaseToDeriveUpdateForNode']);
        }

        if (!id) {
          return cbk([400, 'ExpectedIdToDeriveUpdateForNode']);
        }

        if (!lnd) {
          return cbk([400, 'ExpectedLndToDeriveUpdateForNode']);
        }

        return cbk();
      },

      // Determine what key is used
      key: ['validate', ({}, cbk) => cbk(null, keyForRecord({id, type}).key)],

      // Pull the fresh record
      getFresh: ['validate', ({}, cbk) => {
        return getNode({
          lnd,
          is_omitting_channels: true,
          public_key: id,
        },
        cbk);
      }],

      // Pull the existing record
      getStored: ['key', ({key}, cbk) => db.getItem({key, table}, cbk)],

      // Derive the update or create directives for this row
      updates: [
        'getFresh',
        'getStored',
        'key',
        ({getFresh, getStored, key}, cbk) =>
      {
        try {
          return cbk(null, updatesForNode({
            key,
            node: getFresh,
            record: getStored.record,
          });

          return cbk(null, updates);
        } catch (err) {
          return cbk([503, err.message]);
        }
      }],
    },
    returnResult({reject, resolve, of: 'updates'}, cbk));
  });
};
