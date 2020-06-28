const asyncAuto = require('async/auto');
const asyncMap = require('async/map');
const {Cursor} = require('node-lmdb');
const {decodeFirst} = require('cbor');
const {returnResult} = require('asyncjs-util');

const isMatchingWhere = require('./is_matching_where');

const bufferToHex = buffer => buffer.toString('hex');

/** Query lmdb

  {
    db: {
      close: <Close Table and Environment Function>
      env: {
        beginTxn: <Start New Transaction Function>
      }
      table: <LMDB Database Table Object>
    }
    [keys]: {
      [before]: <Before Key String>
      [starts_with]: <Key Starts With String>
    }
    [limit]: <Results Limit Number>
    [where]: {
      $attribute_name: {
        [eq]: <Equals String>
        [gt]: <Greater Than String>
        [starts_with]: <Starts With String>
      }
    }
  }

  @throws
  <Error>

  @returns via cbk or Promise
  {
    records: [{record: <Record Object>, key: <Key Hex String>}]
  }
*/
module.exports = ({db, keys, limit, where}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!db) {
          throw new Error('ExpectedDbToQueryLmdb');
        }

        return cbk();
      },

      // Start the transaction
      transaction: ['validate', ({}, cbk) => {
        return cbk(null, db.env.beginTxn({readOnly: true}));
      }],

      // Get the items
      getItems: ['transaction', ({transaction}, cbk) => {
        const before = !!keys && !!keys.before ? keys.before : null;
        const cursor = new Cursor(transaction, db.table, {keyIsBuffer: true});
        const items = [];
        const q = !!keys && keys.starts_with ? keys.starts_with : null;

        try {
          for (
            let n = !q ? cursor.goToFirst() : cursor.goToRange(q);
            (n !== null && items.length < (limit || Infinity));
            n = cursor.goToNext()
          ) {
            cursor.getCurrentBinary((key, value) => {
              // Break loop when query constraints are no longer met
              if (!!q && !key.startsWith(q)) {
                return cursor.goToLast();
              }

              // Break loop when the key breaks the before constraint
              if (!!before && key > before) {
                return cursor.goToLast();
              }

              return items.push({key, value});
            });
          }
        } catch (err) {
          return cbk(null, {err});
        }

        return cbk(null, {items});
      }],

      // Close the db
      close: ['getItems', 'transaction', ({getItems, transaction}, cbk) => {
        // Abort when getting the item had an error
        if (!!getItems.err) {
          transaction.abort();
        } else {
          // End the transaction now that the itme was retrieved
          transaction.commit();
        }

        db.close();

        return cbk(getItems.err, getItems);
      }],

      // Decode the values
      decode: ['close', ({getItems}, cbk) => {
        return asyncMap(getItems.items, (item, cbk) => {
          // Decode the values and return the decoded record
          return decodeFirst(item.value, (err, record) => {
            if (!!err) {
              return cbk([503, 'FailedToDecodeRecordsInLmdbDatabase', {err}]);
            }

            return cbk(null, {record, key: bufferToHex(item.key)});
          });
        },
        cbk);
      }],

      // Results
      results: ['decode', ({decode}, cbk) => {
        const records = decode.filter(({key, record}) => {
          if (!where) {
            return true;
          }

          return isMatchingWhere({where, data: record});
        });

        return cbk(null, {records});
      }],
    },
    returnResult({reject, resolve, of: 'results'}, cbk));
  });
};