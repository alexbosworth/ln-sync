const asyncAuto = require('async/auto');
const {returnResult} = require('asyncjs-util');

const {getGraphPair} = require('./../graph');

const {isArray} = Array;
const isIntersecting = (arr1, arr2) => !!arr1.find(n => arr2.includes(n));
const shortKey = key => key.substring(0, 16);

/** Describe the cltv delta changing on policy

  {
    db: <Database Object>
    id: <Channel Id String>
    local_keys: [<Local Public Key Hex String>]
    [previous]: <Previous CLTV Delta Number>
    public_key: <Public Key Hex String>
    updated: <Updated CLTV Delta Number>
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
          return cbk([400, 'ExpectedDbToDescribePolicyCltvUpdated']);
        }

        if (!args.id) {
          return cbk([400, 'ExpectedChannelToDescribePolicyCltvUpdated']);
        }

        if (!isArray(args.local_keys)) {
          return cbk([400, 'ExpectedLocalKeysToDescribePolicyCltvUpdated']);
        }

        if (!args.public_key) {
          return cbk([400, 'ExpectedPublicKeyToDescribePolicyCltvUpdated']);
        }

        if (!args.updated) {
          return cbk([400, 'ExpectedUpdatedCltvToDescribeUpdatedCltv']);
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
        if (!getPair.pair) {
          return cbk(null, {});
        }

        // Exit early when there is no previous value
        if (!args.previous) {
          return cbk(null, {});
        }

        const {updated} = args;
        const {previous} = args;

        const author = getPair.pair.nodes.find(n => n.id === args.public_key);
        const peer = getPair.pair.nodes.find(n => n.id !== args.public_key);

        return cbk(null, {
          description: {
            action: `cltv to ${peer.alias || shortKey(peer.id)} changed`,
            detail: `from ${previous} to ${updated} on ${args.id}`,
            is_local: isIntersecting(args.local_keys, [author.id, peer.id]),
            subject: `${author.alias || shortKey(author.id)}`,
          },
        });
      }],
    },
    returnResult({reject, resolve, of: 'description'}, cbk));
  });
};
