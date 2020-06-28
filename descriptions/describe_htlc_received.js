const asyncAuto = require('async/auto');
const {returnResult} = require('asyncjs-util');

const {getGraphNode} = require('./../graph');
const {getGraphPair} = require('./../graph');

const mtokensAsBig = mtokens => (Number(mtokens) / 1e11).toFixed(11);
const shortKey = key => key.substring(0, 16);

/** Describe an HTLC received

  {
    db: <Database Object>
    in_channel: <Receiving In Channel Id String>
    public_key: <Receiving Node Public Key Hex String>
  }

  @returns via cbk or Promise
  {
    [description]: {
      action: <Action String>
      detail: <Detail String>
      is_local: <Describes Node Local Event Bool>
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
          return cbk([400, 'ExpectedDbToDescribeHltcReceived']);
        }

        if (!args.in_channel) {
          return cbk([400, 'ExpectedInChannelToDescribeHtlcReceived']);
        }

        if (!args.public_key) {
          return cbk([400, 'ExpectedPublicKeyToDescribeHtlcReceived']);
        }

        return cbk();
      },

      // Get the in channel pair
      getPair: ['validate', ({}, cbk) => {
        return getGraphPair({db: args.db, id: args.in_channel}, cbk);
      }],

      // Get the receiving node details
      onNode: ['validate', ({}, cbk) => {
        return getGraphNode({db: args.db, id: args.public_key}, cbk);
      }],

      // Describe the event
      description: ['getPair', 'onNode', ({getPair, onNode}, cbk) => {
        // Exit early when there is no known outgoing channel
        if (!getPair.pair) {
          return cbk(null, {});
        }

        const out = getPair.pair.nodes.find(n => n.id !== onNode.id);

        return cbk(null, {
          description: {
            action: 'received HTLC',
            detail: `on ${out.alias || shortKey(out.id)} ${args.in_channel}`,
            is_local: true,
            subject: onNode.alias || shortKey(onNode.id),
          },
        });
      }],
    },
    returnResult({reject, resolve, of: 'description'}, cbk));
  });
};
