const asyncAuto = require('async/auto');
const {returnResult} = require('asyncjs-util');

const {getGraphPair} = require('./../graph');

const {isArray} = Array;
const isIntersecting = (arr1, arr2) => !!arr1.find(n => arr2.includes(n));
const mtokensAsBig = mtokens => (Number(mtokens) / 1e11).toFixed(11);
const shortKey = key => key.substring(0, 16);

/** Describe a channel base fee being changed

  {
    db: <Database Object>
    id: <Channel Id String>
    local_keys: [<Local Public Key Hex String>]
    [previous]: <Previous Base Fee Millitokens String>
    public_key: <Policy Author Public Key Hex String>
    updated: <Updated Base Fee Millitokens String>
  }

  @returns via cbk or Promise
  {
    [description]: {
      action: <Action String>
      detail: <Detail String>
      is_local: <Is Local Event Bool>
      subject: <Subject String>
    }
  }
*/
module.exports = (args, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!args.db) {
          return cbk([400, 'ExpectedDbToDescribeBaseFeeUpdated']);
        }

        if (!args.id) {
          return cbk([400, 'ExpectedIdToDescribeBaseFeeUpdated']);
        }

        if (!isArray(args.local_keys)) {
          return cbk([400, 'ExpectedLocalKeysToDescribeBaseFeeUpdated']);
        }

        if (!args.public_key) {
          return cbk([400, 'ExpectedPublicKeyToDescribeBaseFeeUpdated']);
        }

        if (!args.updated) {
          return cbk([400, 'ExpectedUpdatedBaseFeeToDescribeBaseFeeUpdated']);
        }

        return cbk();
      },

      // Get the channel pair
      getPair: ['validate', ({}, cbk) => {
        return getGraphPair({db: args.db, id: args.id}, cbk);
      }],

      // Describe the event
      description: ['getPair', ({getPair}, cbk) => {
        // Exit early when there is no known channel
        if (!getPair.pair || !args.previous) {
          return cbk(null, {});
        }

        const author = getPair.pair.nodes.find(n => n.id === args.public_key);
        const newRate = mtokensAsBig(args.updated);
        const oldRate = mtokensAsBig(args.previous);
        const peer = getPair.pair.nodes.find(n => n.id !== args.public_key);

        const detail = `from ${oldRate} to ${newRate} on ${args.id}`;

        return cbk(null, {
          description: {
            action: `changed fee`,
            detail: `to ${peer.alias || shortKey(peer.id)} ${detail}`,
            is_local: isIntersecting(args.local_keys, [author.id, peer.id]),
            subject: `${author.alias || shortKey(author.id)}`,
          },
        });
      }],
    },
    returnResult({reject, resolve, of: 'description'}, cbk));
  });
};
