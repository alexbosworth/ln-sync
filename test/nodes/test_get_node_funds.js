const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const {makeLnd} = require('mock-lnd');

const method = require('./../../nodes/get_node_funds');
const {listChannelsResponse} = require('./../fixtures');

const tests = [
  {
    args: {},
    description: 'LND is required',
    error: [400, 'ExpectedAuthenticatedLndToGetDetailedBalance'],
  },
  {
    args: {lnd: makeLnd({})},
    description: 'Detailed balance is returned',
    expected: {
      closing_balance: 0,
      conflicted_pending: 0,
      invalid_pending: 0,
      offchain_balance: 2,
      offchain_pending: 0,
      onchain_confirmed: 1,
      onchain_pending: 0,
      onchain_vbytes: 144,
      utxos_count: 1
    },
  },
  {
    args: {
      lnd: makeLnd({
        getChannels: ({}, cbk) => cbk(null, {channels: []}),
        getUtxos: ({}, cbk) => cbk(null, {utxos: []}),
      }),
    },
    description: 'No balance is returned',
    expected: {
      closing_balance: 0,
      conflicted_pending: 0,
      invalid_pending: 0,
      offchain_balance: 0,
      offchain_pending: 0,
      onchain_confirmed: 0,
      onchain_pending: 0,
      onchain_vbytes: 0,
      utxos_count: 0
    },
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    if (!!error) {
      await rejects(method(args), error, 'Got expected error');
    } else {
      const res = await method(args);

      deepEqual(res, expected, 'Got expected result');
    }

    return;
  });
});
