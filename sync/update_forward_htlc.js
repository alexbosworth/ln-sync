const asyncAuto = require('async/auto');
const {returnResult} = require('asyncjs-util');

const changesToRecord = require('./changes_to_record');
const keyForRecord = require('./key_for_record');

const createRecordRev = 0;
const fresh = ['out_payment'];
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const separator = ':';
const table = 'forward_htlcs';
const type = 'forward_htlc';

/** Update forward HTLC state

  {
    at: <HTLC Commitment At ISO 8601 Date String>
    [cltv_delta]: <CLTV Delta Number>
    [external_failure]: <External Failure String>
    [fee_mtokens]: <Fee Millitokens String>
    db: {
      getItem: <Get Item Function>
      putItem: <Put Item Function>
      updateItem: <Update Item Function>
    }
    in_channel: <In Channel Id String>
    in_payment: <In Payment Index Number>
    [internal_failure]: <Internal Failure String>
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
      [cltv_delta]: <CLTV Delta Number>
      [external_failure]: <External Failure String>
      [fee_mtokens]: <Fee Millitokens String>
      in_channel: <In Channel Id String>
      in_payment: <In Payment Index Number>
      [internal_failure]: <Internal Failure String>
      is_confirmed: <HTLC Settled Bool>
      is_failed: <HTLC Failed Bool>
      [mtokens]: <HTLC Millitokens String>
      out_channel: <Outgoing Channel Id String>
      out_payment: <HTLC Index Number>
      public_key: <Node Public Key Buffer Object>
      [timeout]: <HTLC Timeout Height Number>
      updated_at: <HTLC Commitment At ISO 8601 Date String>
    }
    [original]: {
      [cltv_delta]: <CLTV Delta Number>
      [external_failure]: <External Failure String>
      [fee_mtokens]: <Fee Millitokens String>
      in_channel: <In Channel Id String>
      in_payment: <In Payment Index Number>
      [internal_failure]: <Internal Failure String>
      is_confirmed: <HTLC Settled Bool>
      is_failed: <HTLC Failed Bool>
      [mtokens]: <HTLC Millitokens String>
      out_channel: <Outgoing Channel Id String>
      out_payment: <HTLC Index Number>
      public_key: <Node Public Key Buffer Object>
      [timeout]: <HTLC Timeout Height Number>
      updated_at: <HTLC Commitment At ISO 8601 Date String>
    }
    [previous]: {
      [external_failure]: <External Failure String>
      [internal_failure]: <Internal Failure String>
      [is_confirmed]: <HTLC Settled Bool>
      [is_failed]: <HTLC Failed Bool>
      [updated_at]: <HTLC Commitment At ISO 8601 Date String>
    }
    [updates]: {
      [external_failure]: <External Failure String>
      [internal_failure]: <Internal Failure String>
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
          return cbk([400, 'ExpectedHtlcUpdateDateToUpdateForwardHtlc']);
        }

        if (!args.db) {
          return cbk([400, 'ExpectedDatabaseToUpdateForwardHtlc']);
        }

        if (args.in_channel === undefined) {
          return cbk([400, 'ExpectedOutChannelToUpdateForwardHtlc']);
        }

        if (args.in_payment === undefined) {
          return cbk([400, 'ExpectedOutPaymentIndexToUpdateForwardHtlc']);
        }

        if (args.is_confirmed === undefined) {
          return cbk([400, 'ExpectedHtlcConfStatusToUpdateForwardHtlc']);
        }

        if (args.is_failed === undefined) {
          return cbk([400, 'ExpectedHtlcFailedStatusToUpdateForwardHtlc']);
        }

        if (args.out_channel === undefined) {
          return cbk([400, 'ExpectedOutChannelToUpdateForwardHtlc']);
        }

        if (args.out_payment === undefined) {
          return cbk([400, 'ExpectedOutPaymentIndexToUpdateForwardHtlc']);
        }

        if (!args.public_key) {
          return cbk([400, 'ExpectedPublicKeyToUpdateForwardHtlc']);
        }

        return cbk();
      },

      // Record key
      key: ['validate', ({}, cbk) => {
        const id = [
          args.public_key,
          args.in_channel,
          args.in_payment,
          args.out_channel,
          args.out_payment,
        ];

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
          cltv_delta: args.cltv_delta,
          external_failure: args.external_failure,
          fee_mtokens: args.fee_mtokens,
          in_channel: args.in_channel,
          in_payment: args.in_payment,
          internal_failure: args.internal_failure,
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
              _rev: createRecordRev,
              cltv_delta: record.cltv_delta,
              external_failure: record.external_failure,
              fee_mtokens: record.fee_mtokens,
              in_channel: record.in_channel,
              in_payment: record.in_payment,
              internal_failure: record.internal_failure,
              is_confirmed: record.is_confirmed,
              is_failed: record.is_failed,
              mtokens: record.mtokens,
              out_channel: record.out_channel,
              out_payment: record.out_payment,
              public_key: hexAsBuffer(args.public_key),
              timeout: record.timeout,
              updated_at: record.updated_at,
            },
            updated: {
              cltv_delta: args.cltv_delta || record.cltv_delta,
              external_failure: args.external_failure,
              fee_mtokens: args.fee_mtokens || record.fee_mtokens,
              in_channel: args.in_channel,
              in_payment: args.in_payment,
              internal_failure: args.internal_failure,
              is_confirmed: args.is_confirmed,
              is_failed: args.is_failed,
              mtokens: args.mtokens || record.mtokens,
              out_channel: args.out_channel,
              out_payment: args.out_payment,
              public_key: hexAsBuffer(args.public_key),
              timeout: args.timeout || record.timeout,
              updated_at: args.at,
            },
          });

          return cbk(null, update);
        } catch (err) {
          return cbk([503, 'UnexpectedErrorDerivingForwardHtlcUpdate', {err}]);
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
              cltv_delta: getStored.record.cltv_delta,
              external_failure: getStored.record.external_failure,
              fee_mtokens: getStored.record.fee_mtokens,
              in_channel: getStored.record.in_channel,
              in_payment: getStored.record.in_payment,
              internal_failure: getStored.record.internal_failure,
              is_confirmed: getStored.record.is_confirmed,
              is_failed: getStored.record.is_failed,
              mtokens: getStored.record.mtokens,
              out_channel: getStored.record.out_channel,
              out_payment: getStored.record.out_payment,
              public_key: getStored.record.public_key,
              timeout: getStored.record.timeout,
              updated_at: getStored.record.updated_at,
            },
            previous: {
              external_failure: update.previous.external_failure,
              internal_failure: update.previous.internal_failure,
              is_confirmed: update.previous.is_confirmed,
              is_failed: update.previous.is_failed,
              updated_at: update.previous.updated_at,
            },
            updates: {
              external_failure: update.updates.external_failure,
              internal_failure: update.updates.internal_failure,
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
            cltv_delta: create.cltv_delta,
            external_failure: create.external_failure,
            fee_mtokens: create.fee_mtokens,
            in_channel: create.in_channel,
            in_payment: create.in_payment,
            internal_failure: create.internal_failure,
            is_confirmed: create.is_confirmed,
            is_failed: create.is_failed,
            mtokens: create.mtokens,
            out_channel: create.out_channel,
            out_payment: create.out_payment,
            public_key: create.public_key,
            timeout: create.timeout,
            updated_at: create.updated_at,
          },
        });
      }],
    },
    returnResult({reject, resolve, of: 'updates'}, cbk));
  });
};
