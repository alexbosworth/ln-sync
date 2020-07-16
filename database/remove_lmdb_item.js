const asyncAuto = require('async/auto');
const {returnResult} = require('asyncjs-util');

const deleteOptions = {keyIsBuffer: true};
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const {isBuffer} = Buffer;

/** Deleta an LMDB item from a table

  {
    db: {
      close: <Close Table and Environment Function>
      env: {
        beginTxn: <Start New Transaction Function>
      }
      table: <LMDB Database Table Object>
    }
    key: <Item Primary Key Hex String or Buffer>
  }

  @returns via cbk or Promise
*/
module.exports = ({db, key}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!db) {
          return cbk([400, 'ExpectedDatabaseEnvironmentToRemoveLmdbItem']);
        }

        if (!key) {
          return cbk([400, 'ExpectedDatabaseKeyToRemovoeLmdbItem']);
        }

        return cbk();
      },

      // Start the transaction
      transaction: ['validate', ({}, cbk) => {
        try {
          return cbk(null, db.env.beginTxn({}));
        } catch (err) {
          return cbk([503, 'UnexpectedTransactionErrRemovingLmdbItem', {err}]);
        }
      }],

      // Delete the item
      remove: ['transaction', ({transaction}, cbk) => {
        const recordKey = isBuffer(key) ? key : hexAsBuffer(key);

        try {
          transaction.del(db.table, recordKey, deleteOptions);

          return cbk();
        } catch (err) {
          // Error outcomes do not trigger immediate cbk to close the db first
          return cbk(null, {err});
        }
      }],

      // Close the db
      close: ['remove', 'transaction', ({remove, transaction}, cbk) => {
        try {
          // Abort when removing the item had an error
          if (!!remove.err) {
            transaction.abort();
          } else {
            // End the transaction now that the item was removed successfully
            transaction.commit();
          }

          db.close();

          return cbk();
        } catch (err) {
          return cbk([503, 'FailedToCloseDatabaseAfterLmdbDelete', {err}]);
        }
      }],

      // Final result of removal
      result: ['close', 'remove', ({remove}, cbk) => {
        const {err} = remove;

        // Exit early when there was an error removing the item
        if (!!err) {
          return cbk(null, [503, 'UnexpectedErrorRemovingItemInLmdb', {err}]);
        }

        return cbk();
      }],
    },
    returnResult({reject, resolve}, cbk));
  });
};
