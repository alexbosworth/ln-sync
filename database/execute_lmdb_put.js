const asyncAuto = require('async/auto');
const {decodeFirst} = require('cbor');
const {encode} = require('cbor');
const {returnResult} = require('asyncjs-util');

const dbFullErrorMessage = 'MDB_MAP_FULL: Environment mapsize limit reached';
const {isArray} = Array;
const {isBuffer} = Buffer;

/** Put item in LMDB

  {
    db: {
      close: <Close Database Function>
      env: {
        beginTxn: <Begin Transaction Function>
      }
      table: <LMDB Database Table Object>
    }
    fresh: [<Expected Fresh Attribute String>]
    key: <Item Primary Key Buffer Object>
    record: <Record Object>
  }

  @returns via cbk or Promise
*/
module.exports = ({db, fresh, key, record}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!db) {
          return cbk([400, 'ExpectedLmdbDatabaseEnvironmentToPutLmdbItem']);
        }

        if (!!fresh && !isArray(fresh)) {
          return cbk([400, 'ExpectedDbFreshExpectationsAsArrayOfAttributes']);
        }

        if (!isBuffer(key)) {
          return cbk([400, 'ExpectedLmdbItemKeyToPutLmdbItem']);
        }

        if (!record) {
          return cbk([400, 'ExpectedItemRecordToPutInLmdbDatabase']);
        }

        return cbk();
      },

      // Encode the record
      encodeRecord: ['validate', ({}, cbk) => {
        try {
          const encoded = encode(record);

          return cbk(null, {encoded});
        } catch (err) {
          return cbk([400, 'ExpectedValidRecordToEncode']);
        }
      }],

      // Start transaction
      transaction: ['encodeRecord', ({}, cbk) => {
        try {
          const tx = db.env.beginTxn();

          return cbk(null, tx);
        } catch (err) {
          return cbk([503, 'FailedToStartLmdbPutTransaction']);
        }
      }],

      // Get the existing record
      getRecord: ['transaction', ({transaction}, cbk) => {
        try {
          const value = transaction.getBinary(db.table, key);

          return cbk(null, {value});
        } catch (err) {
          return cbk(null, {err});
        }
      }],

      // Decode the record
      decodeRecord: ['getRecord', ({getRecord}, cbk) => {
        // Exit early when there was no record stored
        if (!getRecord.value) {
          return cbk(null, {});
        }

        return decodeFirst(getRecord.value, (err, record) => {
          // Avoid exiting flow with error to allow for closing the transaction
          if (!!err) {
            return cbk(null, {err: [503, 'UnexpectedErrDecodingItem', {err}]});
          }

          return cbk(null, {record});
        });
      }],

      // Delete the existing record
      deleteRecord: [
        'getRecord',
        'transaction',
        ({getRecord, transaction}, cbk) =>
      {
        // Exit early when getting the record had an issue
        if (getRecord.err) {
          return cbk();
        }

        const isExistingItem = getRecord.value !== null;

        if (!fresh && isExistingItem) {
          try {
            transaction.del(db.table, key);
          } catch (err) {
            return cbk([503, 'UnexpectedErrorDeletingRecordFromLmdb', {err}]);
          }
        }

        return cbk();
      }],

      // Write the item
      putItem: [
        'decodeRecord',
        'deleteRecord',
        'encodeRecord',
        'getRecord',
        'transaction',
        ({decodeRecord, encodeRecord, getRecord, transaction}, cbk) =>
      {
        // Exit early without putting item when the record couldn't be decoded
        if (!!decodeRecord.err || !!getRecord.err) {
          return cbk(null, {});
        }

        const record = decodeRecord.record || {};

        // Exit early when an expected fresh attribute is present
        if (!!fresh && !!fresh.find(attr => record[attr] !== undefined)) {
          return cbk(null, {err: [409, 'ExpectedNonExistingAttr', {record}]});
        }

        try {
          transaction.putBinary(db.table, key, encodeRecord.encoded);

          return cbk(null, {is_item_written: true});
        } catch (err) {
          // Exit early when the db is full, avoiding closing the db
          if (err.message === dbFullErrorMessage) {
            try {
              transaction.abort();
            } catch (err) {
              return cbk([503, 'FailedToAbortTransactionOnDbFull', {err}]);
            }

            return cbk([503, 'InsufficientSpaceToWrite']);
          }

          return cbk(null, {err: [503, 'UnexpectedErrorWritingItem', {err}]});
        }
      }],

      // Commit the transaction
      commit: ['putItem', 'transaction', ({putItem, transaction}, cbk) => {
        // Exit early and abort when the item was not written
        if (!putItem.is_item_written) {
          try {
            transaction.abort();
          } catch (err) {
            return cbk([503, 'UnexpectedErrorAbortingFailedLmdbWrite', {err}]);
          }

          return cbk(null, {});
        }

        try {
          transaction.commit();
        } catch (err) {
          // Exit early when the db is full
          if (err.message === dbFullErrorMessage) {
            return cbk([503, 'InsufficientSpaceToWrite']);
          }

          return cbk(null, {err: [503, 'UnexpectedErrorCommittingTx', {err}]});
        }

        return cbk(null, {});
      }],

      // Close down the database access
      closeDb: [
        'commit',
        'decodeRecord',
        'getRecord',
        'putItem',
        ({commit, decodeRecord, getRecord, putItem}, cbk) =>
      {
        try {
          db.close();
        } catch (err) {
          return cbk([503, 'UnexpectedClosingDatabaseAfterLmdbPut', {err}]);
        }

        // Exit with error when the transaction commitment had an issue
        if (!!commit.err) {
          return cbk(commit.err);
        }

        // Exit with error when the record could not be decoded
        if (!!decodeRecord.err) {
          return cbk(decodeRecord.err);
        }

        // Exit with error when the get failed
        if (!!getRecord.err) {
          return cbk(getRecord.err);
        }

        // Exit with error when the write failed
        if (!!putItem.err) {
          return cbk(putItem.err);
        }

        return cbk();
      }],
    },
    returnResult({reject, resolve}, cbk));
  });
};
