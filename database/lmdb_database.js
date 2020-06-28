const getLmdbItem = require('./get_lmdb_item');
const openLmdbDatabase = require('./open_lmdb_database');
const putLmdbItem = require('./put_lmdb_item');
const queryLmdb = require('./query_lmdb');
const updateLmdbItem = require('./update_lmdb_item');

/** Get LMDB Database object

  {
    fs: {
      makeDirectory: <Make Directory Function>
    }
    path: <LMDB Database Path String>
  }

  @returns
  {
    db: {
      getItem: <Get Item Function> ({key, table}, cbk) => {}
      putItem: <Put Item Function> ({key, record, table}, cbk) => {}
      updateItem: <Update Item Function> ({key, changes, expect, table}, cbk)
    }
  }
*/
module.exports = ({fs, path}) => {
  if (!fs) {
    throw new Error('ExpectedFileSystemMethodsForLmdbDatabase');
  }

  if (!path) {
    throw new Error('ExpectedFileSystemPathForLmdbDatabase');
  }

  const openDb = table => openLmdbDatabase({fs, path, table}).db;

  return {
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
          return putLmdbItem({fresh, key, record, db: openDb(table)}, cbk);
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
      updateItem: ({key, changes, expect, table}, cbk) => {
        try {
          return updateLmdbItem({changes, expect, key, db: openDb(table)}, cbk);
        } catch (err) {
          return cbk([503, 'FailedToOpenDatabaseToUpdateLmdbItem', {err}]);
        }
      },
    },
  };
};
