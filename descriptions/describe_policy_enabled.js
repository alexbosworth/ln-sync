const asyncAuto = require('async/auto');
const {returnResult} = require('asyncjs-util');

const {getGraphPair} = require('./../graph');

const shortKey = key => key.substring(0, 16);

/** Describe a policy being enabled

  {
    db: <Database Object>
    id: <Channel Id String>
    public_key: <Public Key Hex String>
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
          return cbk([400, 'ExpectedDbToDescribePolicyEnabled']);
        }

        if (!args.id) {
          return cbk([400, 'ExpectedChannelToDescribePolicyEnabled']);
        }

        if (!args.public_key) {
          return cbk([400, 'ExpectedPublicKeyToDescribePolicyEnabled']);
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
            action: `inbound enabled`,
            detail: `by ${author.alias || shortKey(author.id)} on ${args.id}`,
            subject: `${peer.alias || shortKey(peer.id)}`,
          },
        });
      }],
    },
    returnResult({reject, resolve, of: 'description'}, cbk));
  });
};
