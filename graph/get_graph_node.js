const asyncAuto = require('async/auto');
const {returnResult} = require('asyncjs-util');

const {keyForRecord} = require('./../sync');

const defaultColor = '#000000';
const table = 'nodes';
const type = 'node';

/** Get node details

  {
    db: <Database Object>
    id: <Public Key Hex String>
  }

  @returns via cbk or Promise
  {
    alias: <Node Alias String>
    color: <RGB Hex Color String>
    features: [bit: <BOLT 09 Feature Bit Number]
    id: <Public Key Hex String>
    sockets: [<Host and Port String>]
  }
*/
module.exports = ({db, id}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!db) {
          return cbk([400, 'ExpectedDatabaseToGetNode']);
        }

        if (!id) {
          return cbk([400, 'ExpectedNodeIdToGetNode']);
        }

        return cbk();
      },

      // Derive the key for the row
      key: ['validate', ({}, cbk) => cbk(null, keyForRecord({id, type}).key)],

      // Get the stored record
      getStored: ['key', ({key}, cbk) => db.getItem({key, table}, cbk)],

      // Get node details from the database
      node: ['getStored', ({getStored}, cbk) => {
        const record = getStored.record || {};

        return cbk(null, {
          id,
          alias: record.alias || String(),
          color: record.color || defaultColor,
          features: record.features || [],
          sockets: record.sockets || [],
        });
      }],
    },
    returnResult({reject, resolve, of: 'node'}, cbk));
  });
};
