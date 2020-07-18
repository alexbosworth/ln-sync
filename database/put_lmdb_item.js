const asyncAuto = require('async/auto');
const asyncRetry = require('async/retry');
const {returnResult} = require('asyncjs-util');

const executeLmdbPut = require('./execute_lmdb_put');

const {ceil} = Math;
const dbIncrementBytes = 10e6;
const insufficientSpaceError = 'InsufficientSpaceToWrite';
const interval = 200;
const {isArray} = Array;
const {isBuffer} = Buffer;
const maxRetryAttempts = 1e4;

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

      // Execute the put
      putItem: ['validate', ({}, cbk) => {
        return asyncRetry({
          errorFilter: err => {
            if (!isArray(err)) {
              return false;
            }

            const [, message] = err;

            return message === insufficientSpaceError;
          },
          interval,
          times: maxRetryAttempts,
        },
        cbk => {
          return executeLmdbPut({db, fresh, key, record}, err => {
            if (!!err && !isArray(err)) {
              return cbk([503, 'UnexpectedErrorExecutingLmdbPut', {err}]);
            }

            // Exit with error when there was an unexpected error
            if (!!err) {
              const [, message] = err;

              if (message === insufficientSpaceError) {
                db.env.resize(ceil(db.env.info().mapSize) + dbIncrementBytes);
              }

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
