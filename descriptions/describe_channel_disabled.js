const asyncAuto = require('async/auto');
const {returnResult} = require('asyncjs-util');

const {getGraphPair} = require('./../graph');

const bigUnits = tokens => !tokens ? String() : (tokens / 1e8).toFixed(8);
const short = key => key.substring(0, 16);

/** Describe a channel being disabled

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
      is_local: <Is Local Bool>
      is_major: <Is Major Bool>
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
          return cbk([400, 'ExpectedDbToDescribeChannelDisabled']);
        }

        if (!args.id) {
          return cbk([400, 'ExpectedChannelToDescribeChannelDisabled']);
        }

        if (!args.public_key) {
          return cbk([400, 'ExpectedNodePublicKeyToDescribeChannelDisabled']);
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

        const channel = `${bigUnits(getPair.channel.capacity)} channel`.trim();
        const peer = getPair.pair.nodes.find(n => n.id !== args.public_key);
        const subject = getPair.pair.nodes.find(n => n.id === args.public_key);

        return cbk(null, {
          description: {
            action: `deactivated ${channel}`,
            detail: `with ${peer.alias || short(peer.id)}`,
            is_local: true,
            is_major: true,
            subject: subject.alias || short(subject.id),
          },
        });
      }],
    },
    returnResult({reject, resolve, of: 'description'}, cbk));
  });
};
