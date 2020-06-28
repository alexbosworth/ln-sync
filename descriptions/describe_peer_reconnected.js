const asyncAuto = require('async/auto');
const {returnResult} = require('asyncjs-util');

const {getGraphNode} = require('./../graph');

const shortKey = key => key.substring(0, 16);

/** Describe a peer being re-connected

  {
    db: <Database Object>
    node: <Node Public Key Hex String>>
    to: <Peer Public Key Hex String>
  }

  @returns via cbk or Promise
  {
    [description]: {
      action: <Action String>
      detail: <Detail String>
      is_local: <Is Local Bool>
      subject: <Subject String>
    }
  }
*/
module.exports = ({db, node, to}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!db) {
          return cbk([400, 'ExpectedDbToDescribePeerReconnected']);
        }

        if (!node) {
          return cbk([400, 'ExpectedNodeToDescribePeerReconnected']);
        }

        if (!to) {
          return cbk([400, 'ExpectedPeerToDescribePeerReconnected']);
        }

        return cbk();
      },

      // Get node details
      getNode: ['validate', ({}, cbk) => getGraphNode({db, id: node}, cbk)],

      // Get peer details
      getPeer: ['validate', ({}, cbk) => getGraphNode({db, id: to}, cbk)],

      // Describe the event
      description: ['getNode', 'getPeer', ({getNode, getPeer}, cbk) => {
        return cbk(null, {
          description: {
            action: `reconnected to ${getPeer.alias}`,
            detail: `${getPeer.id}`,
            is_local: true,
            subject: `${getNode.alias || shortKey(getNode.id)}`,
          },
        });
      }],
    },
    returnResult({reject, resolve, of: 'description'}, cbk));
  });
};
