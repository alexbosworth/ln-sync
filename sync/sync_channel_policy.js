const asyncAuto = require('async/auto');
const {getChannel} = require('ln-service');
const {returnResult} = require('asyncjs-util');

const keyForRecord = require('./key_for_record');
const policyRecord = require('./policy_record');
const policyUpdate = require('./policy_update');

const bufferAsHex = buffer => buffer.toString('hex');
const fresh = ['id'];
const {isArray} = Array;
const separator = ':';
const table = 'policies';
const type = 'policy';

/** Sync a channel policy

  {
    db: {
      getItem: <Get Item Function>
      putItem: <Put Item Function>
      updateItem: <Update Item Function>
    }
    id: <Standard Channel Id String>
    lnd: <Authenticated LND API Object>
    public_key: <Public Key Hex String>
  }

  @returns via cbk or Promise
  {
    [created]: {
      base_fee_mtokens: <Channel Base Fee Millitokens String>
      cltv_delta: <Channel CLTV Delta Number>
      fee_rate: <Channel Feel Rate In Millitokens Per Million Number>
      id: <Standard Format Channel Id String>
      is_disabled: <Channel Is Disabled Bool>
      [max_htlc_mtokens]: <Channel Maximum HTLC Millitokens String>
      min_htlc_mtokens: <Channel Minimum HTLC Millitokens String>
      public_key: <Policy Public Key Hex String>
      updated_at: <Update Received At ISO 8601 Date String>
    }
    [previous]: {
      [base_fee_mtokens]: <Updated Channel Base Fee Millitokens String>
      [cltv_delta]: <Updated Channel CLTV Delta Number>
      [fee_rate]: <Updated Channel Fee Rate In Millitokens Per Million Number>
      [is_disabled]: <Channel Is Disabled Bool>
      [max_htlc_mtokens]: <Channel Maximum HTLC Millitokens String>
      [min_htlc_mtokens]: <Channel Minimum HTLC Millitokens String>
    }
    [updates]: {
      [base_fee_mtokens]: <Updated Channel Base Fee Millitokens String>
      [cltv_delta]: <Updated Channel CLTV Delta Number>
      [fee_rate]: <Updated Channel Fee Rate In Millitokens Per Million Number>
      [is_disabled]: <Channel Is Disabled Bool>
      [max_htlc_mtokens]: <Channel Maximum HTLC Millitokens String>
      [min_htlc_mtokens]: <Channel Minimum HTLC Millitokens String>
    }
  }
*/
module.exports = (args, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!args.db) {
          return cbk([400, 'ExpectedDatabaseToSyncChannelPolicy']);
        }

        if (!args.id) {
          return cbk([400, 'ExpectedIdToSyncChannelPolicy']);
        }

        if (!args.lnd) {
          return cbk([400, 'ExpectedLndToSyncChannelPolicy']);
        }

        if (!args.public_key) {
          return cbk([400, 'ExpectedPublicKeyToSyncChannelPolicy']);
        }

        return cbk();
      },

      // Derive the key for the policy record row
      key: ['validate', ({}, cbk) => {
        const {key} = keyForRecord({
          type,
          id: [args.public_key, args.id].join(separator),
        });

        return cbk(null, key);
      }],

      // Get the stored channel policy
      getStored: ['key', ({key}, cbk) => {
        return args.db.getItem({key, table}, cbk);
      }],

      // Get the fresh policy data
      getFresh: ['getStored', ({getStored}, cbk) => {
        return getChannel({id: args.id, lnd: args.lnd}, (err, res) => {
          if (isArray(err) && err.slice().shift() === 404) {
            return cbk();
          }

          if (!!err) {
            return cbk([503, 'UnexpectedErrGettingChanToSyncPolicy', {err}]);
          }

          return cbk(null, res);
        });
      }],

      // Determine creation of the policy
      create: ['getFresh', 'getStored', ({getFresh, getStored}, cbk) => {
        // Exit early when the record is already present
        if (!getFresh || !!getStored.record) {
          return cbk();
        }

        try {
          const {record} = policyRecord({
            channel: getFresh,
            public_key: args.public_key,
          });

          return cbk(null, record);
        } catch (err) {
          return cbk([503, 'FailedToDerivePolicyRecordToSyncPolicy', {err}]);
        }
      }],

      // Determine update to the policy
      update: [
        'getFresh',
        'getStored',
        'key',
        ({getFresh, getStored, key}, cbk) =>
      {
        // Exit early when there is no stored record
        if (!getFresh || !getStored.record) {
          return cbk();
        }

        if (!getFresh.updated_at) {
          return cbk();
        }

        try {
          const update = policyUpdate({
            channel: getFresh,
            public_key: args.public_key,
            record: getStored.record,
          });

          return cbk(null, update);
        } catch (err) {
          return cbk([503, 'UnexpectedErrorDerivingPolicyUpdate', {err}]);
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
      updates: ['create', 'update', ({create, update}, cbk) => {
        if (!!update && !!update.changes) {
          return cbk(null, {
            previous: {
              base_fee_mtokens: update.previous.base_fee_mtokens,
              cltv_delta: update.previous.cltv_delta,
              fee_rate: update.previous.fee_rate,
              id: update.previous.id,
              is_disabled: update.previous.is_disabled,
              max_htlc_mtokens: update.previous.max_htlc_mtokens,
              min_htlc_mtokens: update.previous.min_htlc_mtokens,
            },
            updates: {
              base_fee_mtokens: update.updates.base_fee_mtokens,
              cltv_delta: update.updates.cltv_delta,
              fee_rate: update.updates.fee_rate,
              id: update.updates.id,
              is_disabled: update.updates.is_disabled,
              max_htlc_mtokens: update.updates.max_htlc_mtokens,
              min_htlc_mtokens: update.updates.min_htlc_mtokens,
            },
          });
        }

        if (!!create) {
          return cbk(null, {
            created: {
              base_fee_mtokens: create.base_fee_mtokens,
              cltv_delta: create.cltv_delta,
              fee_rate: create.fee_rate,
              id: create.id,
              is_disabled: create.is_disabled,
              max_htlc_mtokens: create.max_htlc_mtokens,
              min_htlc_mtokens: create.min_htlc_mtokens,
              public_key: bufferAsHex(create.public_key),
            },
          });
        }

        return cbk(null, {});
      }],
    },
    returnResult({reject, resolve, of: 'updates'}, cbk));
  });
};
