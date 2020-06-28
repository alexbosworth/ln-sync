const asyncAuto = require('async/auto');
const {decodeFirst} = require('cbor');
const {returnResult} = require('asyncjs-util');

const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const {isBuffer} = Buffer;

/** Get an LMDB item from a table

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
  {
    [record]: <Item Object>
  }
*/
module.exports = ({db, key}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!db) {
          return cbk([400, 'ExpectedDatabaseEnvironmentToGetLmdbItem']);
        }

        if (!key) {
          return cbk([400, 'ExpectedDatabaseKeyToGetLmdbItem']);
        }

        return cbk();
      },

      // Start the transaction
      transaction: ['validate', ({}, cbk) => {
        try {
          return cbk(null, db.env.beginTxn({readOnly: true}));
        } catch (err) {
          return cbk([503, 'UnexpectedTransactionErrGettingLmdbItem', {err}]);
        }
      }],

      // Fetch item
      getItem: ['transaction', ({transaction}, cbk) => {
        const recordKey = isBuffer(key) ? key : hexAsBuffer(key);

        try {
          const value = transaction.getBinary(db.table, recordKey);

          return cbk(null, {value});
        } catch (err) {
          // Error outcomes do not trigger immediate cbk to close the db first
          return cbk(null, {err});
        }
      }],

      // Close the db
      close: ['getItem', 'transaction', ({getItem, transaction}, cbk) => {
        try {
          // Abort when getting the item had an error
          if (!!getItem.err) {
            transaction.abort();
          } else {
            // End the transaction now that the item was retrieved
            transaction.commit();
          }

          db.close();

          return cbk();
        } catch (err) {
          return cbk([503, 'FailedToCloseDatabaseAfterLmdbGet', {err}]);
        }
      }],

      // Decode item and return the decoded record object
      decodeValue: ['close', 'getItem', ({getItem}, cbk) => {
        const {err} = getItem;

        // Exit early when there was an error getting the item
        if (!!err) {
          return cbk(null, [503, 'UnexpectedErrorGettingItemFromLmdb', {err}]);
        }

        // Exit early when there is no matching record
        if (!getItem.value) {
          return cbk(null, {});
        }

        // Decode the value and return the decoded record
        return decodeFirst(getItem.value, (err, record) => {
          if (!!err) {
            return cbk([503, 'FailedToDecodeRecordFromLmdbDatabase', {err}]);
          }

          return cbk(null, {record});
        });
      }],
    },
    returnResult({reject, resolve, of: 'decodeValue'}, cbk));
  });
};
