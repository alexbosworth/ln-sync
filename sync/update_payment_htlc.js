const asyncAuto = require('async/auto');
const {returnResult} = require('asyncjs-util');

const changesToRecord = require('./changes_to_record');
const keyForRecord = require('./key_for_record');

const createRecordRev = 0;
const fresh = ['out_payment'];
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const separator = ':';
const table = 'payment_htlcs';
const type = 'payment_htlc';

/** Update payment HTLC state

  {
    at: <HTLC Commitment At ISO 8601 Date String>
    db: {
      getItem: <Get Item Function>
      putItem: <Put Item Function>
      updateItem: <Update Item Function>
    }
    is_confirmed: <HTLC Settled Bool>
    is_failed: <HTLC Failed Bool>
    [mtokens]: <HTLC Millitokens String>
    out_channel: <Outgoing Channel Id String>
    out_payment: <HTLC Index Number>
    public_key: <Node Public Key Hex String>
    [timeout]: <HTLC Timeout Height Number>
  }

  @returns via cbk or Promise
  {
    [created]: {
      is_confirmed: <HTLC Settled Bool>
      is_failed: <HTLC Failed Bool>
      mtokens: <HTLC Millitokens String>
      out_channel: <Outgoing Channel Id String>
      out_payment: <HTLC Index Number>
      timeout: <HTLC Timeout Height Number>
      updated_at: <HTLC Commitment At ISO 8601 Date String>
    }
    [original]: {
      is_confirmed: <HTLC Settled Bool>
      is_failed: <HTLC Failed Bool>
      mtokens: <HTLC Millitokens String>
      out_channel: <Outgoing Channel Id String>
      out_payment: <HTLC Index Number>
      timeout: <HTLC Timeout Height Number>
      updated_at: <HTLC Commitment At ISO 8601 Date String>
    }
    [previous]: {
      [is_confirmed]: <HTLC Settled Bool>
      [is_failed]: <HTLC Failed Bool>
      out_channel: <Outgoing Channel Id String>
      out_payment: <HTLC Index Number>
      [updated_at]: <HTLC Commitment At ISO 8601 Date String>
    }
    [updates]: {
      [is_confirmed]: <HTLC Settled Bool>
      [is_failed]: <HTLC Failed Bool>
      out_channel: <Outgoing Channel Id String>
      out_payment: <HTLC Index Number>
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
          return cbk([400, 'ExpectedHtlcUpdateDateToUpdatePaymentHtlc']);
        }

        if (!args.db) {
          return cbk([400, 'ExpectedDatabaseToUpdatePaymentHtlc']);
        }

        if (args.is_confirmed === undefined) {
          return cbk([400, 'ExpectedHtlcConfirmationStatusToUpdateHtlc']);
        }

        if (args.is_failed === undefined) {
          return cbk([400, 'ExpectedHtlcFailedStatusToUpdatePaymentHtlc']);
        }

        if (args.out_channel === undefined) {
          return cbk([400, 'ExpectedOutChannelToUpdatePaymentHtlc']);
        }

        if (args.out_payment === undefined) {
          return cbk([400, 'ExpectedOutPaymentIndexToUpdatePaymentHtlc']);
        }

        if (!args.public_key) {
          return cbk([400, 'ExpectedPublicKeyToUpdatePaymentHtlc']);
        }

        return cbk();
      },

      // Record key
      key: ['validate', ({}, cbk) => {
        const id = [args.public_key, args.out_channel, args.out_payment];

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
          is_confirmed: args.is_confirmed,
          is_failed: args.is_failed,
          mtokens: args.mtokens,
          out_channel: args.out_channel,
          out_payment: args.out_payment,
          public_key: hexAsBuffer(args.public_key),
          timeout: args.timeout,
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
              mtokens: record.mtokens,
              out_channel: record.out_channel,
              out_payment: record.out_payment,
              timeout: record.timeout,
              updated_at: record.updated_at,
            },
            updated: {
              is_confirmed: args.is_confirmed,
              is_failed: args.is_failed,
              mtokens: args.mtokens || record.mtokens,
              out_channel: args.out_channel,
              out_payment: args.out_payment,
              timeout: args.timeout || record.timeout,
              updated_at: args.at,
            },
          });

          return cbk(null, update);
        } catch (err) {
          return cbk([503, 'UnexpectedErrorDerivingPaymentHtlcUpdate', {err}]);
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
              is_confirmed: getStored.record.is_confirmed,
              is_failed: getStored.record.is_failed,
              mtokens: getStored.record.mtokens,
              out_channel: getStored.record.out_channel,
              out_payment: getStored.record.out_payment,
              timeout: getStored.record.timeout,
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
            is_confirmed: create.is_confirmed,
            is_failed: create.is_failed,
            mtokens: create.mtokens,
            out_channel: create.out_channel,
            out_payment: create.out_payment,
            timeout: create.timeout,
            updated_at: create.updated_at,
          },
        });
      }],
    },
    returnResult({reject, resolve, of: 'updates'}, cbk));
  });
};
