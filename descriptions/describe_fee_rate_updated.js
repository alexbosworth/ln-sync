const asyncAuto = require('async/auto');
const {returnResult} = require('asyncjs-util');

const {getGraphPair} = require('./../graph');

const asDisplay = rate => `${(rate / 1e4).toFixed(2)}% (${rate})`;
const shortKey = key => key.substring(0, 16);

/** Describe a channel fee rate being changed

  {
    db: <Database Object>
    id: <Channel Id String>
    [previous]: <Previous Fee Rate Number>
    public_key: <Policy Author Public Key Hex String>
    updated: <Updated Fee Rate Number>
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
          return cbk([400, 'ExpectedDbToDescribeFeeRateUpdated']);
        }

        if (!args.id) {
          return cbk([400, 'ExpectedIdToDescribeFeeRateUpdated']);
        }

        if (!args.public_key) {
          return cbk([400, 'ExpectedPublicKeyToDescribeFeeRateUpdated']);
        }

        if (!args.updated) {
          return cbk([400, 'ExpectedUpdatedBaseFeeToDescribeFeeRateUpdated']);
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
        const newRate = asDisplay(args.updated);
        const oldRate = asDisplay(args.previous);
        const peer = getPair.pair.nodes.find(n => n.id !== args.public_key);

        const detail = `from ${oldRate} to ${newRate} on ${args.id}`;

        return cbk(null, {
          description: {
            action: `changed fee rate`,
            detail: `to ${peer.alias || shortKey(peer.id)} ${detail}`,
            subject: `${author.alias || shortKey(author.id)}`,
          },
        });
      }],
    },
    returnResult({reject, resolve, of: 'description'}, cbk));
  });
};
