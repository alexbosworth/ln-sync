const asyncAuto = require('async/auto');
const asyncRetry = require('async/retry');
const {returnResult} = require('asyncjs-util');

const executeLmdbUpdate = require('./execute_lmdb_update');

const {ceil} = Math;
const dbIncrementBytes = 10e6;
const failedToStartError = 'FailedToStartLmdbUpdateTransaction';
const insufficientSpaceError = 'InsufficientSpaceToWrite';
const interval = 200;
const {isArray} = Array;
const {isBuffer} = Buffer;
const maxRetryAttempts = 1e4;

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

      // Execute the update
      updateItem: ['validate', ({}, cbk) => {
        return asyncRetry({
          interval,
          errorFilter: err => {
            return false;

            if (!isArray(err)) {
              return false;
            }

            const [, message] = err;

            switch (message) {
            case insufficientSpaceError:
              return true;

            default:
              return false;
            }
          },
          times: maxRetryAttempts,
        },
        cbk => {
          return executeLmdbUpdate({changes, db, expect, key}, err => {
            if (!!err && !isArray(err)) {
              return cbk([503, 'UnexpectedErrorExecutingLmdbUpdate', {err}]);
            }

            // Exit early when there isn't enough space to update the record
            if (isArray(err) && err.slice().pop() === insufficientSpaceError) {
              db.env.resize(ceil(db.env.info().mapSize) + dbIncrementBytes);

              return cbk(err);
            }

            // Exit with error when there was an unexpected error
            if (!!err) {
              return cbk(err);
            }

            return cbk();
          });
        },
        cbk);
      }],
    },
    returnResult({reject, resolve}, cbk));
  });
};
