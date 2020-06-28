const asyncAuto = require('async/auto');
const {returnResult} = require('asyncjs-util');

const {getGraphNode} = require('./../graph');

const shortKey = key => key.substring(0, 16);

/** Describe a peer being connected

  {
    db: <Database Object>
    id: <Added Public Key Hex String>
  }

  @returns via cbk or Promise
  {
    [description]: {
      action: <Action String>
      detail: <Detail String>
      subject: <Subject String>
    }
  }
*/
module.exports = ({db, id}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!db) {
          return cbk([400, 'ExpectedDbToDescribeNodeAdded']);
        }

        if (!id) {
          return cbk([400, 'ExpectedPublicKeyToDescribeNodeAdded']);
        }

        return cbk();
      },

      // Get node details
      getNode: ['validate', ({}, cbk) => getGraphNode({db, id}, cbk)],

      // Describe the event
      description: ['getNode', ({getNode}, cbk) => {
        return cbk(null, {
          description: {
            action: `added to graph`,
            detail: `${id}`,
            subject: `${getNode.alias || shortKey(getNode.id)}`,
          },
        });
      }],
    },
    returnResult({reject, resolve, of: 'description'}, cbk));
  });
};
