const asyncAuto = require('async/auto');
const {returnResult} = require('asyncjs-util');

const {getGraphNode} = require('./../graph');
const {getGraphPair} = require('./../graph');

const mtokensAsBig = mtokens => (Number(mtokens) / 1e11).toFixed(11);
const shortKey = key => key.substring(0, 16);

/** Describe a payment attempt being sent

  {
    db: <Database Object>
    mtokens: <Sending Millitokens String>
    out_channel: <Sending Out Channel Id String>
    public_key: <Sending Node Public Key Hex String>
  }

  @returns via cbk or Promise
  {
    [description]: {
      action: <Action String>
      detail: <Detail String>
      is_local: <Describes Node Local Event Bool>
      is_major: <Describes a Major Event Bool>
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
          return cbk([400, 'ExpectedDbToDescribeAttemptPaymentSent']);
        }

        if (!args.mtokens) {
          return cbk([400, 'ExpectedMtokensToDescribeAttemptPaymentSent']);
        }

        if (!args.out_channel) {
          return cbk([400, 'ExpectedOutChannelToDescribeAttemptPaymentSent']);
        }

        if (!args.public_key) {
          return cbk([400, 'ExpectedPublicKeyToDescribeAttemptPaymentSent']);
        }

        return cbk();
      },

      // Get the out channel pair
      getPair: ['validate', ({}, cbk) => {
        return getGraphPair({db: args.db, id: args.out_channel}, cbk);
      }],

      // Get the sending node details
      onNode: ['validate', ({}, cbk) => {
        return getGraphNode({db: args.db, id: args.public_key}, cbk);
      }],

      // Describe the event
      description: ['getPair', 'onNode', ({getPair, onNode}, cbk) => {
        // Exit early when there is no known outgoing channel
        if (!getPair.pair) {
          return cbk(null, {});
        }

        const outPeer = getPair.pair.nodes.find(n => n.id !== onNode.id);

        return cbk(null, {
          description: {
            action: `sent out ${outPeer.alias || shortKey(outPeer.id)}`,
            detail: `${mtokensAsBig(args.mtokens)} on ${args.out_channel}`,
            is_local: true,
            is_major: true,
            subject: onNode.alias || shortKey(onNode.id),
          },
        });
      }],
    },
    returnResult({reject, resolve, of: 'description'}, cbk));
  });
};
