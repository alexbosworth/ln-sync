const asyncAuto = require('async/auto');
const {returnResult} = require('asyncjs-util');

const changesToRecord = require('./changes_to_record');
const keyForRecord = require('./key_for_record');

const createRecordRev = 1;
const fresh = ['in_payment'];
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const separator = ':';
const table = 'receive_htlcs';
const type = 'receive_htlc';

/** Update receive HTLC state

  {
    at: <HTLC Commitment At ISO 8601 Date String>
    db: {
      getItem: <Get Item Function>
      putItem: <Put Item Function>
      updateItem: <Update Item Function>
    }
    [external_failure]: <External Failure Reason String>
    in_channel: <Inbound Channel String>
    in_payment: <HTLC Index Number>
    [internal_failure]: <Internal Failure Reason String>
    is_confirmed: <HTLC Settled Bool>
    is_failed: <HTLC Failed Bool>
    public_key: <Node Public Key Hex String>
  }

  @returns via cbk or Promise
  {
    [created]: {
      [external_failure]: <External Failure Reason String>
      in_channel: <Inbound Channel String>
      in_payment: <HTLC Index Number>
      [internal_failure]: <Internal Failure Reason String>
      is_confirmed: <HTLC Settled Bool>
      is_failed: <HTLC Failed Bool>
      updated_at: <HTLC Commitment At ISO 8601 Date String>
    }
    [original]: {
      [external_failure]: <External Failure Reason String>
      in_channel: <Inbound Channel String>
      in_payment: <HTLC Index Number>
      [internal_failure]: <Internal Failure Reason String>
      is_confirmed: <HTLC Settled Bool>
      is_failed: <HTLC Failed Bool>
      updated_at: <HTLC Commitment At ISO 8601 Date String>
    }
    [previous]: {
      [external_failure]: <External Failure Reason String>
      [internal_failure]: <Internal Failure Reason String>
      [is_confirmed]: <HTLC Settled Bool>
      [is_failed]: <HTLC Failed Bool>
      [updated_at]: <HTLC Commitment At ISO 8601 Date String>
    }
    [updates]: {
      [external_failure]: <External Failure Reason String>
      [internal_failure]: <Internal Failure Reason String>
      [is_confirmed]: <HTLC Settled Bool>
      [is_failed]: <HTLC Failed Bool>
      [updated_at]: <HTLC Commitment At ISO 8601 Date String>
    }
  }
*/
module.exports = (args, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!args.at) {
          return cbk([400, 'ExpectedHtlcUpdateDateToUpdateReceiveHtlc']);
        }

        if (!args.db) {
          return cbk([400, 'ExpectedDatabaseToUpdateReceiveHtlc']);
        }

        if (!args.in_channel) {
          return cbk([400, 'ExpectedInChannelToUpdateReceiveHtlc']);
        }

        if (args.in_payment === undefined) {
          return cbk([400, 'ExpectedInPaymentIndexToUpdateReceiveHtlc']);
        }

        if (args.is_confirmed === undefined) {
          return cbk([400, 'ExpectedHtlcIsConfirmedToUpdateReceiveHtlc']);
        }

        if (args.is_failed === undefined) {
          return cbk([400, 'ExpectedHtlcFailedStatusToUpdateReceiveHtlc']);
        }

        if (!args.public_key) {
          return cbk([400, 'ExpectedNodePublicKeyToUpdateReceiveHtlc']);
        }

        return cbk();
      },

      // Record key
      key: ['validate', ({}, cbk) => {
        const id = [args.public_key, args.in_channel, args.in_payment];

        return cbk(null, keyForRecord({type, id: id.join(separator)}).key);
      }],

      // Get the current state
      getStored: ['key', ({key}, cbk) => args.db.getItem({key, table}, cbk)],

      // Determine creation of the record
      create: ['getStored', ({getStored}, cbk) => {
        // Exit early when the record is already present
        if (!!getStored.record) {
          return cbk();
        }

        return cbk(null, {
          _rev: createRecordRev,
          external_failure: args.external_failure,
          in_channel: args.in_channel,
          in_payment: args.in_payment,
          internal_failure: args.internal_failure,
          is_confirmed: args.is_confirmed,
          is_failed: args.is_failed,
          public_key: hexAsBuffer(args.public_key),
          updated_at: args.at,
        });
      }],

      // Determine update to the htlc
      update: ['getStored', 'key', ({getStored, key}, cbk) => {
        const {record} = getStored;

        // Exit early when there is no stored record
        if (!record) {
          return cbk();
        }

        try {
          const update = changesToRecord({
            record: {
              is_confirmed: record.is_confirmed,
              is_failed: record.is_failed,
              updated_at: record.updated_at,
            },
            updated: {
              is_confirmed: args.is_confirmed,
              is_failed: args.is_failed,
              updated_at: args.at,
            },
          });

          return cbk(null, update);
        } catch (err) {
          return cbk([503, 'UnexpectedErrorDerivingReceiveHtlcUpdate', {err}]);
        }
      }],

      // Execute the create to the database
      executeCreate: ['create', 'key', ({create, key}, cbk) => {
        // Exit early when there is no create to execute
        if (!create) {
          return cbk();
        }

        return args.db.putItem({fresh, key, table, record: create}, cbk);
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

        return args.db.updateItem({
          key,
          table,
          changes: update.changes,
          expect: {_rev: getStored.record._rev},
        },
        cbk);
      }],

      // Result of update
      updates: [
        'create',
        'getStored',
        'update',
        ({create, getStored, update}, cbk) =>
      {
        if (!!update && !!update.changes) {
          return cbk(null, {
            original: {
              external_failure: getStored.record.external_failure,
              in_channel: getStored.record.in_channel,
              in_payment: getStored.record.in_payment,
              internal_failure: getStored.record.internal_failure,
              is_confirmed: getStored.record.is_confirmed,
              is_failed: getStored.record.is_failed,
              public_key: getStored.record.public_key,
              updated_at: getStored.record.updated_at,
            },
            previous: {
              is_confirmed: update.previous.is_confirmed,
              is_failed: update.previous.is_failed,
              updated_at: update.previous.updated_at,
            },
            updates: {
              is_confirmed: update.updates.is_confirmed,
              is_failed: update.updates.is_failed,
              updated_at: update.updates.updated_at,
            },
          });
        }

        if (!create) {
          return cbk(null, {});
        }

        return cbk(null, {
          created: {
            external_failure: create.external_failure,
            in_channel: create.in_channel,
            in_payment: create.in_payment,
            internal_failure: create.internal_failure,
            is_confirmed: create.is_confirmed,
            is_failed: create.is_failed,
            public_key: create.public_key,
            updated_at: create.updated_at,
          },
        });
      }],
    },
    returnResult({reject, resolve, of: 'updates'}, cbk));
  });
};
