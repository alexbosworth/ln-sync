const asyncAuto = require('async/auto');
const {getChannels} = require('ln-service');
const {getWalletInfo} = require('ln-service');
const {returnResult} = require('asyncjs-util');

const keyForRecord = require('./key_for_record');
const localChannelUpdate = require('./local_channel_update');

const add = 1;
const createRecordRev = 0;
const fresh = ['id'];
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const idSeparator = ':';
const table = 'local_channels';
const type = 'local_channel';

/** Sync local channel details

  {
    db: {
      getItem: <Get Item Function>
      putItem: <Put Item Function>
      updateItem: <Update Item Function>
    }
    lnd: <Authenticated LND API Object>
    public_key: <Public Key Hex String>
    transaction_id: <Funding Transaction Id String>
    transaction_vout: <Funding Transaction Vout Number>
  }

  @returns via cbk or Promise
  {
    [created]: {
      capacity: <Channel Token Capacity Number>
      commit_transaction_fee: <Commit Transaction Fee Number>
      commit_transaction_weight: <Commit Transaction Weight Number>
      [cooperative_close_address]: <Coop Close Restricted to Address String>
      id: <Standard Format Channel Id String>
      is_active: <Channel Active Bool>
      is_partner_initiated: <Channel Partner Opened Channel Bool>
      is_private: <Channel Is Private Bool>
      [is_static_remote_key]: <Remote Key Is Static Bool>
      local_balance: <Local Balance Tokens Number>
      [local_given]: <Local Initially Pushed Tokens Number>
      local_reserve: <Local Reserved Tokens Number>
      partner_public_key: <Channel Partner Public Key Buffer Object>
      received: <Received Tokens Number>
      remote_balance: <Remote Balance Tokens Number>
      [remote_given]: <Remote Initially Pushed Tokens Number>
      remote_reserve: <Remote Reserved Tokens Number>
      sent: <Sent Tokens Number>
      transaction_id: <Blockchain Transaction Id String>
      transaction_vout: <Blockchain Transaction Vout Number>
      unsettled_balance: <Unsettled Balance Tokens Number>
    }
    [original]: {
      id: <Standard Format Channel Id String>
    }
    [previous]: {
      [commit_transaction_fee]: <Commitment Transaction Fee Tokens Number>
      [commit_transaction_weight]: <Commitment Transaction Weight Units Number>
      [is_active]: <Channel Is Active Bool>
      [local_balance]: <Channel Local Balance Tokens Number>
      [received]: <Channel Received Tokens Number>
      [remote_balance]: <Channel Remote Balance Tokens Number>
      [sent]: <Channel Sent Tokens Number>
      [unsettled_balance]: <Channel Unsettled Tokens Number>
    }
    [updates]: {
      [commit_transaction_fee]: <Commitment Transaction Fee Tokens Number>
      [commit_transaction_weight]: <Commitment Transaction Weight Units Number>
      [is_active]: <Channel Is Active Bool>
      [local_balance]: <Channel Local Balance Tokens Number>
      [received]: <Channel Received Tokens Number>
      [remote_balance]: <Channel Remote Balance Tokens Number>
      [sent]: <Channel Sent Tokens Number>
      [unsettled_balance]: <Channel Unsettled Tokens Number>
    }
  }
*/
module.exports = (args, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!args.db) {
          return cbk([400, 'ExpectedDatabaseToSyncLocalChannel']);
        }

        if (!args.lnd) {
          return cbk([400, 'ExpectedLndToSyncLocalChannel']);
        }

        if (!args.public_key) {
          return cbk([400, 'ExpectedPublicKeyToSyncLocalChannel']);
        }

        if (!args.transaction_id) {
          return cbk([400, 'ExpectedFundingTransactionIdToSyncLocalChannel']);
        }

        if (args.transaction_vout === undefined) {
          return cbk([400, 'ExpectedTransactionOutputToSyncLocalChannel']);
        }

        return cbk();
      },

      // Derive the key for the row
      key: ['validate', ({}, cbk) => {
        const id = [
          args.public_key,
          args.transaction_id,
          args.transaction_vout,
        ];

        return cbk(null, keyForRecord({type, id: id.join(idSeparator)}).key);
      }],

      // Get the stored record
      getStored: ['key', ({key}, cbk) => args.db.getItem({key, table}, cbk)],

      // Get the fresh data
      getFresh: ['getStored', ({getStored}, cbk) => {
        // There is no local channel lookup method, so get all
        return getChannels({lnd: args.lnd}, (err, res) => {
          if (!!err) {
            return cbk(err);
          }

          const channel = res.channels
            .filter(n => n.transaction_id === args.transaction_id)
            .find(n => n.transaction_vout === args.transaction_vout);

          return cbk(null, channel);
        });
      }],

      // Determine creation of the record
      create: ['getFresh', 'getStored', ({getFresh, getStored}, cbk) => {
        // Exit early when the record is already present or there is no fresh
        if (!getFresh || !!getStored.record) {
          return cbk();
        }

        const record = {
          _rev: createRecordRev,
          capacity: getFresh.capacity,
          commit_transaction_fee: getFresh.commit_transaction_fee,
          commit_transaction_weight: getFresh.commit_transaction_weight,
          cooperative_close_address: getFresh.cooperative_close_address,
          id: getFresh.id,
          is_active: getFresh.is_active,
          is_partner_initiated: getFresh.is_partner_initiated,
          is_private: getFresh.is_private,
          is_static_remote_key: getFresh.is_static_remote_key,
          local_balance: getFresh.local_balance,
          local_given: getFresh.local_given,
          local_public_key: hexAsBuffer(args.public_key),
          local_reserve: getFresh.local_reserve,
          partner_public_key: hexAsBuffer(getFresh.partner_public_key),
          received: getFresh.received,
          remote_balance: getFresh.remote_balance,
          remote_given: getFresh.remote_given,
          remote_reserve: getFresh.remote_reserve,
          sent: getFresh.sent,
          transaction_id: hexAsBuffer(args.transaction_id),
          transaction_vout: args.transaction_vout,
          unsettled_balance: getFresh.unsettled_balance,
        };

        return cbk(null, record);
      }],

      // Determine update
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
          const update = localChannelUpdate({
            record,
            channel: {
              commit_transaction_fee: getFresh.commit_transaction_fee,
              commit_transaction_weight: getFresh.commit_transaction_weight,
              is_active: getFresh.is_active,
              local_balance: getFresh.local_balance,
              received: getFresh.received,
              remote_balance: getFresh.remote_balance,
              sent: getFresh.sent,
              unsettled_balance: getFresh.unsettled_balance,
            },
          });

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
          const {previous} = update;
          const {updates} = update;

          return cbk(null, {
            original: {
              id: getStored.record.id,
            },
            previous: {
              commit_transaction_fee: previous.commit_transaction_fee,
              commit_transaction_weight: previous.commit_transaction_weight,
              is_active: previous.is_active,
              local_balance: previous.local_balance,
              received: previous.received,
              remote_balance: previous.remote_balance,
              sent: previous.sent,
              unsettled_balance: previous.unsettled_balance,
            },
            updates: {
              commit_transaction_fee: updates.commit_transaction_fee,
              commit_transaction_weight: updates.commit_transaction_weight,
              is_active: updates.is_active,
              local_balance: updates.local_balance,
              received: updates.received,
              remote_balance: updates.remote_balance,
              sent: updates.sent,
              unsettled_balance: updates.unsettled_balance,
            },
          });
        }

        if (!!create) {
          return cbk(null, {
            created: {
              capacity: create.capacity,
              commit_transaction_fee: create.commit_transaction_fee,
              commit_transaction_weight: create.commit_transaction_weight,
              cooperative_close_address: create.cooperative_close_address,
              id: create.id,
              is_active: create.is_active,
              is_partner_initiated: create.is_partner_initiated,
              is_private: create.is_private,
              is_static_remote_key: create.is_static_remote_key,
              local_balance: create.local_balance,
              local_given: create.local_given,
              local_reserve: create.local_reserve,
              partner_public_key: create.partner_public_key,
              received: create.received,
              remote_balance: create.remote_balance,
              remote_given: create.remote_given,
              remote_reserve: create.remote_reserve,
              sent: create.sent,
              transaction_id: args.transaction_id,
              transaction_vout: args.transaction_vout,
              unsettled_balance: create.unsettled_balance,
            },
          });
        }

        return cbk(null, {});
      }],
    },
    returnResult({reject, resolve, of: 'updates'}, cbk));
  });
};
