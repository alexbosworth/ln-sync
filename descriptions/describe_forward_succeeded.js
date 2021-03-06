const asyncAuto = require('async/auto');
const {returnResult} = require('asyncjs-util');

const {getGraphNode} = require('./../graph');
const {getGraphPair} = require('./../graph');

const mtokensAsBig = mtokens => (Number(mtokens) / 1e11).toFixed(11);
const shortKey = key => key.substring(0, 16);

/** Describe a successful forward

  {
    db: <Database Object>
    fee_mtokens: <Fee Millitokens String>
    in_channel: <Inbound Channel Id String>
    mtokens: <Forward Millitokens String>
    out_channel: <Outbound Channel Id String>
    public_key: <Node Public Key Hex String>
  }

  @returns
  {
    [description]: {
      action: <Action String>
      detail: <Detail String>
      is_local: <Is Local Bool>
      is_major: <Is Major Bool>
      subject <Subject String>
    }
  }
*/
module.exports = (args, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!args.db) {
          return cbk([400, 'ExpectedDatabaseToDescribeForwardSuccess']);
        }

        if (!args.fee_mtokens) {
          return cbk([400, 'ExpectedFeeMillitokensToDescribeForwardSuccess']);
        }

        if (!args.in_channel) {
          return cbk([400, 'ExpectedInboundChannelToDescribeForwardSuccess']);
        }

        if (!args.mtokens) {
          return cbk([400, 'ExpectedMillitokensToDescribeForwardSuccess']);
        }

        if (!args.out_channel) {
          return cbk([400, 'ExpectedOutboundChannelToDescribeForwardSuccess']);
        }

        if (!args.public_key) {
          return cbk([400, 'ExpectedNodePublicKeyToDescribeForwardSuccess']);
        }

        return cbk();
      },

      // Get metadata about the forwarding node
      getForwardingNode: ['validate', ({}, cbk) => {
        return getGraphNode({db: args.db, id: args.public_key}, cbk);
      }],

      // Get metadata about the inbound channel side
      getInboundChannel: ['validate', ({}, cbk) => {
        return getGraphPair({db: args.db, id: args.in_channel}, cbk);
      }],

      // Get metadata about the outbound channel side
      getOutboundChannel: ['validate', ({}, cbk) => {
        return getGraphPair({db: args.db, id: args.out_channel}, cbk);
      }],

      // Description of successful forward
      description: [
        'getForwardingNode',
        'getInboundChannel',
        'getOutboundChannel',
        ({getForwardingNode, getInboundChannel, getOutboundChannel}, cbk) =>
      {
        const {id} = getForwardingNode;

        if (!getInboundChannel.pair || !getOutboundChannel.pair) {
          return cbk(null, {});
        }

        const inPeer = getInboundChannel.pair.nodes.find(n => n.id !== id);
        const outPeer = getOutboundChannel.pair.nodes.find(n => n.id !== id);

        const inName = inPeer.alias || shortKey(inPeer.id);
        const outName = outPeer.alias || shortKey(outPeer.id);

        const fee = mtokensAsBig(args.fee_mtokens);
        const total = mtokensAsBig(args.mtokens);

        return cbk(null, {
          description: {
            action: `forwarded ${total} (earned ${fee})`,
            detail: `from ${inName} to ${outName}`,
            is_local: true,
            is_major: true,
            subject: getForwardingNode.alias || shortKey(args.public_key),
          },
        });
      }],
    },
    returnResult({reject, resolve, of: 'description'}, cbk));
  });
};
