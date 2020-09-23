const asyncAuto = require('async/auto');
const {getChannels} = require('lightning/lnd_methods');
const {getNode} = require('lightning/lnd_methods');
const {getWalletInfo} = require('lightning/lnd_methods');
const {returnResult} = require('asyncjs-util');

const liquidityTokens = require('./liquidity_tokens');
const {getNetwork} = require('./../chain');
const {getScoredNodes} = require('./../graph');

/** Get the channel available liquidity

  A request function is required when min_node_score is specified

  {
    [is_outbound]: <Return Outbound Liquidity Bool>
    [is_top]: <Return Top Liquidity Bool>
    lnd: <Authenticated LND API Object>
    [min_node_score]: <Minimum Node Score Number>
    [max_fee_rate]: <Max Inbound Fee Rate Parts Per Million Number>
    [request]: <Request Function>
    [with]: <Liquidity With Specific Node Public Key Hex String>
  }

  @returns via cbk
  {
    tokens: [<Liquidity Tokens Number>]
  }
*/
module.exports = (args, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!!args.is_outbound && args.max_fee_rate !== undefined) {
          return cbk([400, 'MaxLiquidityFeeRateNotSupportedForOutbound']);
        }

        if (!args.lnd) {
          return cbk([400, 'ExpectedLndToGetLiquidity']);
        }

        if (!!args.min_node_score && !args.request) {
          return cbk([400, 'ExpectedRequestFunctionToFilterByNodeScore']);
        }

        return cbk();
      },

      // Get the channels
      getChannels: ['validate', ({}, cbk) => {
        return getChannels({lnd: args.lnd}, cbk);
      }],

      // Determine which network the node is on
      getNetwork: ['validate', ({}, cbk) => getNetwork({lnd: args.lnd}, cbk)],

      // Get the node's public key
      getNodeKey: ['validate', ({}, cbk) => {
        return getWalletInfo({lnd: args.lnd}, cbk);
      }],

      // Get policies
      getPolicies: ['getNodeKey', ({getNodeKey}, cbk) => {
        if (args.max_fee_rate === undefined) {
          return cbk(null, {channels: []});
        }

        return getNode({
          lnd: args.lnd,
          public_key: getNodeKey.public_key,
        },
        cbk);
      }],

      // Get node scores
      getScores: ['getNetwork', ({getNetwork}, cbk) => {
        if (!args.min_node_score) {
          return cbk(null, {});
        }

        return getScoredNodes({
          network: getNetwork.network,
          request: args.request,
        },
        cbk);
      }],

      // List of tokens to sum
      tokens: [
        'getChannels',
        'getNodeKey',
        'getPolicies',
        'getScores',
        ({getChannels, getNodeKey, getPolicies, getScores}, cbk) =>
      {
        return cbk(null, liquidityTokens({
          channels: getChannels.channels,
          is_outbound: args.is_outbound,
          is_top: args.is_top,
          max_fee_rate: args.max_fee_rate,
          min_node_score: args.min_node_score,
          nodes: getScores.nodes,
          policies: getPolicies.channels.map(n => n.policies),
          public_key: getNodeKey.public_key,
          with: args.with,
        }));
      }],
    },
    returnResult({reject, resolve, of: 'tokens'}, cbk));
  });
};
