const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const {chanInfoResponse} = require('./../fixtures');
const channels = require('./../fixtures').liquidityChannelsResponse;
const {getInfoResponse} = require('./../fixtures');
const {getLiquidity} = require('./../../');
const {getNodeInfoResponse} = require('./../fixtures');

const makeLnd = () => {
  return {
    default: {
      getChanInfo: ({}, cbk) => cbk(null, chanInfoResponse),
      getInfo: ({}, cbk) => cbk(null, getInfoResponse),
      getNodeInfo: ({}, cbk) => cbk(null, getNodeInfoResponse),
      listChannels: ({}, cbk) => cbk(null, {channels}),
    },
  };
};

const tests = [
  {
    args: {},
    description: 'LND is required',
    error: [400, 'ExpectedLndToGetLiquidity'],
  },
  {
    args: {is_outbound: true, lnd: makeLnd({}), max_fee_rate: 1},
    description: 'Fee rate is not supported for outbound liquidity',
    error: [400, 'MaxLiquidityFeeRateNotSupportedForOutbound'],
  },
  {
    args: {lnd: makeLnd({}), with: 'b'},
    description: 'With is expected to be an array',
    error: [400, 'ExpectedArrayOfPublicKeysToGetLiquidity'],
  },
  {
    args: {is_top: true, lnd: makeLnd({})},
    description: 'Liquidity is returned',
    expected: {tokens: [1]},
  },
  {
    args: {is_outbound: true, lnd: makeLnd({}), with: ['b']},
    description: 'Liquidity is returned for outbound request',
    expected: {tokens: [1, 1, 1]},
  },
  {
    args: {lnd: makeLnd({}), max_fee_rate: 1},
    description: 'Liquidity is returned with max fee rate',
    expected: {tokens: []},
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    if (!!error) {
      await rejects(getLiquidity(args), error, 'Got expected error');
    } else {
      const res = await getLiquidity(args);

      deepEqual(res, expected, 'Balance is calculated');
    }

    return;
  });
});
