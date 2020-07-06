const asyncAuto = require('async/auto');
const {returnResult} = require('asyncjs-util');

const {getGraphPair} = require('./../graph');

const {isArray} = Array;
const isIntersecting = (arr1, arr2) => !!arr1.find(n => arr2.includes(n));
const mtokensAsBig = mtokens => (Number(mtokens) / 1e11).toFixed(11);
const shortKey = key => key.substring(0, 16);

/** Describe a channel min htlc being changed

  {
    db: <Database Object>
    id: <Channel Id String>
    local_keys: [<Local Public Key Hex String>]
    [previous]: <Previous Min HTLC Millitokens String>
    public_key: <Policy Author Public Key Hex String>
    updated: <Updated Min HTLC Millitokens String>
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
module.exports = (args, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!args.db) {
          return cbk([400, 'ExpectedDbToDescribeMinHtlcUpdated']);
        }

        if (!args.id) {
          return cbk([400, 'ExpectedIdToDescribeMinHtlcUpdated']);
        }

        if (!isArray(args.local_keys)) {
          return cbk([400, 'ExpectedLocalKeysToDescribeMinHtlcUpdated']);
        }

        if (!args.public_key) {
          return cbk([400, 'ExpectedPublicKeyToDescribeMinHtlcUpdated']);
        }

        if (!args.updated) {
          return cbk([400, 'ExpectedUpdatedBaseFeeToDescribeMinHtlcUpdated']);
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
        const newHtlc = mtokensAsBig(args.updated);
        const oldHtlc = mtokensAsBig(args.previous);
        const peer = getPair.pair.nodes.find(n => n.id !== args.public_key);

        const detail = `from ${oldHtlc} to ${newHtlc} on ${args.id}`;

        return cbk(null, {
          description: {
            action: `changed min HTLC`,
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
