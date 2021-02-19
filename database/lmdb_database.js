const asyncAuto = require('async/auto');
const {returnResult} = require('asyncjs-util');

const getLmdbItem = require('./get_lmdb_item');
const openLmdbDatabase = require('./open_lmdb_database');
const putLmdbItem = require('./put_lmdb_item');
const queryLmdb = require('./query_lmdb');
const removeLmdbItem = require('./remove_lmdb_item');
const updateLmdbItem = require('./update_lmdb_item');

/** Get LMDB Database object

  {
    fs: {
      getFileStatus: <Get File Status Function>
      makeDirectory: <Make Directory Function>
    }
    path: <LMDB Database Path String>
  }

  @returns via cbk or Promise
  {
    db: {
      getItem: <Get Item Function> ({key, table}, cbk) => {}
      putItem: <Put Item Function> ({key, record, table}, cbk) => {}
      query: <Query Function> ({table, where}, cbk) => {}
      removeItem: <Remove Item Function> ({key, table}, cbk) => {}
      updateItem: <Update Item Function> ({key, changes, expect, table}, cbk)
    }
  }
*/
module.exports = ({fs, path}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!fs) {
          return cbk([400, 'ExpectedFileSystemMethodsForLmdbDatabase']);
        }

        if (!path) {
          return cbk([400, 'ExpectedFileSystemPathForLmdbDatabase']);
        }

        return cbk();
      },

      // Make sure there is a home directory
      confirmHomeDir: ['validate', ({}, cbk) => {
        return fs.makeDirectory(path, () => {
          // Ignore errors when making directory, it may already be present
          return cbk();
        });
      }],

      // Database object
      db: ['confirmHomeDir', ({}, cbk) => {
        const openDb = table => openLmdbDatabase({fs, path, table}).db;

        return cbk(null, {
          db: {
            getItem: ({key, table}, cbk) => {
              try {
                return getLmdbItem({key, db: openDb(table)}, cbk);
              } catch (err) {
                return cbk([503, 'FailedToOpenDatabaseToGetItem', {err}]);
              }
            },
            putItem: ({fresh, key, record, table}, cbk) => {
              try {
                const db = openDb(table);

                return putLmdbItem({db, fresh, key, record}, cbk);
              } catch (err) {
                return cbk([503, 'FailedToOpenDatabaseToPutItem', {err}]);
              }
            },
            query: ({table, where}, cbk) => {
              try {
                return queryLmdb({where, db: openDb(table)}, cbk);
              } catch (err) {
                return cbk([503, 'FailedToOpenDatabaseToQueryLmdb', {err}]);
              }
            },
            removeItem: ({key, table}, cbk) => {
              try {
                return removeLmdbItem({key, db: openDb(table)}, cbk);
              } catch (err) {
                return cbk([503, 'FailedToOpenDatabaseToRemoveItem', {err}]);
              }
            },
            updateItem: ({key, changes, expect, table}, cbk) => {
              try {
                const db = openDb(table);

                return updateLmdbItem({changes, db, expect, key}, cbk);
              } catch (err) {
                return cbk([503, 'FailedToOpenDbToUpdateLmdbItem', {err}]);
              }
            },
          },
        });
      }],
    },
    returnResult({reject, resolve, of: 'db'}, cbk));
  });
};
