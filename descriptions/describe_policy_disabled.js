const asyncAuto = require('async/auto');
const {returnResult} = require('asyncjs-util');

const {getGraphPair} = require('./../graph');

const {isArray} = Array;
const isIntersecting = (arr1, arr2) => !!arr1.find(n => arr2.includes(n));
const shortKey = key => key.substring(0, 16);

/** Describe a policy being disabled

  {
    db: <Database Object>
    id: <Channel Id String>
    local_keys: [<Local Public Key Hex String>]
    public_key: <Public Key Hex String>
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
          return cbk([400, 'ExpectedDbToDescribePolicyDisabled']);
        }

        if (!args.id) {
          return cbk([400, 'ExpectedChannelToDescribePolicyDisabled']);
        }

        if (!isArray(args.local_keys)) {
          return cbk([400, 'ExpectedLocalKeysToDescribePolicyDisabled']);
        }

        if (!args.public_key) {
          return cbk([400, 'ExpectedPublicKeyToDescribePolicyDisabled']);
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

        const {pair} = getPair;

        const author = pair.nodes.find(n => n.id === args.public_key);
        const peer = pair.nodes.find(n => n.id !== args.public_key);

        return cbk(null, {
          description: {
            action: `inbound disabled`,
            detail: `by ${author.alias || shortKey(author.id)} on ${args.id}`,
            is_local: isIntersecting(args.local_keys, [author.id, peer.id]),
            subject: `${peer.alias || shortKey(peer.id)}`,
          },
        });
      }],
    },
    returnResult({reject, resolve, of: 'description'}, cbk));
  });
};
