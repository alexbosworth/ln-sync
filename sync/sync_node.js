const asyncAuto = require('async/auto');
const {getNode} = require('lightning/lnd_methods');
const {returnResult} = require('asyncjs-util');

const keyForRecord = require('./key_for_record');
const nodeRecord = require('./node_record');
const nodeUpdate = require('./node_update');

const bufferAsHex = buffer => buffer.toString('hex');
const fresh = ['public_key'];
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const {isArray} = Array;
const table = 'nodes';
const type = 'node';

/** Sync node details

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
      alias: <Node Alias String>
      color: <Node Color String>
      features: [<Feature Bit Number>]
      public_key: <Public Key Buffer Object>
      sockets: [<Node Socket String>]
      updated_at: <Updated At ISO 8601 Date String>
    }
    [previous]: {
      [alias]: <Node Alias String>
      [color]: <Node Color String>
      [features]: [<Feature Bit Number>]
      public_key: <Public Key Buffer Object>
      [sockets]: [<Node Socket String>]
    }
    [updates]: {
      [alias]: <Node Alias String>
      [color]: <Node Color String>
      [features]: [<Feature Bit Number>]
      public_key: <Public Key Buffer Object>
      [sockets]: [<Node Socket String>]
    }
  }
*/
module.exports = ({db, id, lnd}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!db) {
          return cbk([400, 'ExpectedDatabaseToSyncNodeDetails']);
        }

        if (!id) {
          return cbk([400, 'ExpectedIdToSyncNodeDetails']);
        }

        if (!lnd) {
          return cbk([400, 'ExpectedLndToSyncNodeDetails']);
        }

        return cbk();
      },

      // Derive the key for the row
      key: ['validate', ({}, cbk) => cbk(null, keyForRecord({id, type}).key)],

      // Get the stored record
      getStored: ['key', ({key}, cbk) => db.getItem({key, table}, cbk)],

      // Get the fresh data
      getFresh: ['getStored', ({getStored}, cbk) => {
        return getNode({
          lnd,
          is_omitting_channels: true,
          public_key: id,
        },
        (err, res) => {
          if (!!isArray(err) && err.slice().shift() === 404) {
            return cbk();
          }

          if (!!err) {
            return cbk(err);
          }

          return cbk(null, res);
        });
      }],

      // Determine creation of the record
      create: ['getFresh', 'getStored', ({getFresh, getStored}, cbk) => {
        // Exit early when the record is already present
        if (!getFresh || !!getStored.record) {
          return cbk();
        }

        try {
          const {record} = nodeRecord({
            node: {
              alias: getFresh.alias,
              color: getFresh.color,
              features: getFresh.features.map(n => Number(n.bit)),
              public_key: id,
              sockets: getFresh.sockets.map(n => n.socket),
              updated_at: getFresh.updated_at,
            },
          });

          return cbk(null, record);
        } catch (err) {
          return cbk([503, 'FailedToDeriveNodeRecordToSyncNode', {err}]);
        }
      }],

      // Determine update to the node
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
          const update = nodeUpdate({
            record,
            node: {
              alias: getFresh.alias,
              color: getFresh.color,
              features: getFresh.features.map(n => Number(n.bit)),
              public_key: id,
              sockets: getFresh.sockets.map(n => n.socket),
            },
          });

          return cbk(null, update);
        } catch (err) {
          return cbk([503, 'UnexpectedErrorDerivingNodeUpdate', {err}]);
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
              alias: update.previous.alias,
              color: update.previous.color,
              features: update.previous.features,
              public_key: hexAsBuffer(id),
              sockets: update.previous.sockets,
            },
            updates: {
              alias: update.updates.alias,
              color: update.updates.color,
              features: update.updates.features,
              public_key: hexAsBuffer(id),
              sockets: update.updates.sockets,
            },
          });
        }

        if (!!create) {
          return cbk(null, {
            created: {
              alias: create.alias,
              color: create.color,
              features: create.features,
              public_key: create.public_key,
              sockets: create.sockets,
            },
          });
        }

        return cbk(null, {});
      }],
    },
    returnResult({reject, resolve, of: 'updates'}, cbk));
  });
};
