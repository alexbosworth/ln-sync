const {join} = require('path');

const {Env} = require('node-lmdb');

const dbFile = 'data.mdb';
const dbFullErrorMessage = 'MDB_MAP_FULL: Environment mapsize limit reached';
const dbIncrementBytes = 1e6;
const {ceil} = Math;
const notFound = 'No such file or directory';
const openDb = (env, mapSize, path) => env.open({mapSize, path, maxDbs: 256});

/** Open up the LMDB database to a specified table

  Make sure to call close() after calling this method to clean up the db

  {
    fs: {
      getFileStatus: <Get File Status Function>
    }
    path: <LMDB Database Path String>
    table: <LMDB Table Name String>
  }

  @throws <Error>

  @returns
  {
    db: {
      close: <Close Table and Database Function>
      env: {
        beginTxn: <Begin Transaction Function>
      }
      table: <Database Table Object>
    }
  }
*/
module.exports = ({fs, path, table}) => {
  const env = (() => {
    try {
      const environment = new Env();

      openDb(environment, path);

      return environment;
    } catch (err) {
      // Exit early with error when an unexpected error occurs
      if (err.message !== notFound) {
        throw [503, 'UnexpectedErrorOpeningLmdbDatabase', {err}];
      }
    }

    const currentSize = () => {
      try {
        return fs.getFileStatus(join(path, dbFile)).size;
      } catch (err) {
        if (err.code !== 'ENOENT') {
          throw [503, 'UnexpectedErrorGettingSizeOfDatabase', {err}];
        }

        return Number();
      }
    };

    try {
      const environment = new Env();

      openDb(environment, currentSize() + dbIncrementBytes, path);

      return environment;
    } catch (err) {
      throw [503, 'UnexpectedErrorInitiatingLmdbDatabase', {err}];
    }
  })();

  const dbi = (() => {
    while (true) {
      try {
        return env.openDbi({create: true, keyIsBuffer: true, name: table});
      } catch (err) {
        if (err.message !== dbFullErrorMessage) {
          throw [503, 'UnexpectedFailureOpeningDatabaseTable', {err}];
        }

        env.resize(ceil(env.info().mapSize) + dbIncrementBytes);

        try {
          return env.openDbi({create: true, keyIsBuffer: true, name: table});
        } catch (err) {}
      }
    }
  })();

  return {
    db: {
      env,
      close: () => {
        try {
          dbi.close();
        } catch (err) {
          throw [503, 'UnexpectedErrorClosingLmdbDatabaseTable', {err}];
        }

        try {
          env.close();
        } catch (err) {
          throw [503, 'UnexpectedErrorClosingLmdbDatabaseEnvironment', {err}];
        }

        return;
      },
      table: dbi,
    },
  };
};
