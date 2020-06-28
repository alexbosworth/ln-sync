const asyncAuto = require('async/auto');
const {decodeFirst} = require('cbor');
const {encode} = require('cbor');
const {returnResult} = require('asyncjs-util');

const {dbFullErrorMessage} = require('./constants');
const hasMismatch = require('./has_mismatch');

const {isArray} = Array;
const {isBuffer} = Buffer;
const {keys} = Object;

/** Update item in LMDB

  {
    db: {
      close: <Close Database Function>
      env: {
        beginTxn: <Begin Transaction Function>
      }
      table: <Database Table Object>
    }
    changes: {
      <Attribute String>: {
        [add]: <Add Object>
        [remove]: <Remove Value Bool>
        [set]: <Set Value Object>
      }
    }
    [expect]: {
      <Attribute String>: <Expected Value Object>
    }
    key: <Item Primary Key Buffer Object>
  }

  @returns via cbk or Promise
*/
module.exports = ({changes, db, expect, key}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!changes) {
          return cbk([400, 'ExpectedChangesToUpdateLmdbItem']);
        }

        if (!db) {
          return cbk([400, 'ExpectedOpenDatabaseEnvToUpdateLmdbItem']);
        }

        if (!isBuffer(key) || !key.length) {
          return cbk([400, 'ExpectedItemKeyToUpdateLmdbItem']);
        }

        return cbk();
      },

      // Start transaction
      transaction: ['validate', ({}, cbk) => {
        try {
          const tx = db.env.beginTxn();

          return cbk(null, tx);
        } catch (err) {
          return cbk([503, 'FailedToStartLmdbUpdateTransaction', {err}]);
        }
      }],

      // Get the existing record serialized value
      getRecord: ['transaction', ({transaction}, cbk) => {
        try {
          return cbk(null, {value: transaction.getBinary(db.table, key)});
        } catch (err) {
          return cbk(null, {err});
        }
      }],

      // Decode the record
      decodeRecord: ['getRecord', ({getRecord}, cbk) => {
        const {err} = getRecord;

        if (!!err) {
          return cbk(null, {err: [503, 'UnexpectedErrOnGetDbRecord', {err}]});
        }

        // Exit early when there was no record
        if (!getRecord.value) {
          return cbk(null, {err: [409, 'ExpectedLmdbItemToUpdate']});
        }

        return decodeFirst(getRecord.value, (err, record) => {
          if (!!err) {
            return cbk(null, {err: [503, 'UnexpectedGetOnUpdateErr', {err}]});
          }

          return cbk(null, {record});
        });
      }],

      // Record with updates
      updatedRecord: ['decodeRecord', ({decodeRecord}, cbk) => {
        // Exit early when there is nothing to update
        if (!decodeRecord.record) {
          return cbk(null, {});
        }

        const {record} = decodeRecord;

        if (!!expect && !!hasMismatch({expect, record}).mismatch) {
          return cbk(null, {err: [409, 'ExpectedDbValueMismatch', {record}]});
        }

        // Iterate through changes and alter the record
        keys(changes).forEach(attr => {
          return keys(changes[attr]).forEach(type => {
            switch (type) {
            case 'add':
              if (isArray(record[attr])) {
                record[attr].push(changes[attr][type]);
              } else {
                record[attr] += changes[attr][type];
              }
              break;

            case 'remove':
              delete record[attr];
              break;

            case 'set':
              record[attr] = changes[attr][type];
              break;

            default:
              break;
            }
          });
        });

        return cbk(null, {record});
      }],

      // Encode the updated record
      encode: ['updatedRecord', ({updatedRecord}, cbk) => {
        // Exit early when there is no record to encode
        if (!updatedRecord.record) {
          return cbk(null, {});
        }

        try {
          const encoded = encode(updatedRecord.record);

          return cbk(null, {encoded});
        } catch (err) {
          return cbk(null, {err: [400, 'InvalidChangesForLmdbUpdate', {err}]});
        }
      }],

      // Write the updated record
      write: [
        'encode',
        'getRecord',
        'transaction',
        ({encode, getRecord, transaction}, cbk) =>
      {
        // Exit early when there is nothing to write
        if (!encode.encoded) {
          return cbk();
        }

        try {
          transaction.del(db.table, key);
        } catch (err) {
          // Exit early when the db is full
          if (err.message === dbFullErrorMessage) {
            transaction.abort();

            return cbk([503, 'InsufficientSpaceToWrite']);
          }

          return cbk(null, {err: [503, 'UnexpectedErrorDeletingItem', {err}]});
        }

        try {
          transaction.putBinary(db.table, key, encode.encoded);
        } catch (err) {
          // Exit early when the db is full, avoiding closing the db
          if (err.message === dbFullErrorMessage) {
            transaction.abort();

            return cbk([503, 'InsufficientSpaceToWrite']);
          }

          return cbk(null, {err: [503, 'UnexpectedErrorUpdatingItem', {err}]});
        }

        return cbk(null, {is_item_written: true});
      }],

      // Commit the transaction
      commit: ['transaction', 'write', ({transaction, write}, cbk) => {
        // Exit early and abort when the item was not written
        if (!write || !write.is_item_written) {
          try {
            transaction.abort();
          } catch (err) {
            return cbk([503, 'UnexpectedErrorAbortingTxOnLmdbUpdate', {err}]);
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

          return cbk(null, {err: [503, 'UnexpectedUpdateCommitError', {err}]});
        }

        return cbk(null, {});
      }],

      // Close down the database access
      closeDb: [
        'commit',
        'decodeRecord',
        'encode',
        'updatedRecord',
        'write',
        ({commit, decodeRecord, encode, updatedRecord, write}, cbk) =>
      {
        try {
          db.close();
        } catch (err) {
          return cbk([503, 'UnexpectedErrorClosingLmdbAfterUpdate', {err}]);
        }

        // Exit with error when the commit had an error
        if (!!commit.err) {
          return cbk(commit.err);
        }

        // Exit with error when the record could not be decoded
        if (!!decodeRecord.err) {
          return cbk(decodeRecord.err);
        }

        // Exit with error when the record could not be encoded
        if (!!encode.err) {
          return cbk(encode.err);
        }

        // Exit early when there was an error deriving the updated record
        if (!!updatedRecord.err) {
          return cbk(updatedRecord.err);
        }

        // Exit with error when the write failed
        if (!!write.err) {
          return cbk(write.err);
        }

        return cbk();
      }],
    },
    returnResult({reject, resolve}, cbk));
  });
};
