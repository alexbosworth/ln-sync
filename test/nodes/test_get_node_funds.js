const {deepEqual} = require('node:assert').strict;
const {idForTransaction} = require('@alexbosworth/blockchain');
const {rejects} = require('node:assert').strict;
const test = require('node:test');
const {transactionFromComponents} = require('@alexbosworth/blockchain');

const {makeLnd} = require('mock-lnd');

const method = require('./../../nodes/get_node_funds');
const {listChannelsResponse} = require('./../fixtures');

const lockedTransaction = transactionFromComponents({
  inputs: [{id: 'cc'.repeat(32), script: '', sequence: 0, vout: 0}],
  locktime: 0,
  outputs: [{script: '0014' + '22'.repeat(20), tokens: 7777}],
  version: 1,
}).transaction;

const unconfirmedTransaction = transactionFromComponents({
  inputs: [{id: 'ee'.repeat(32), script: '', sequence: 0, vout: 0}],
  locktime: 0,
  outputs: [{script: '0014' + '23'.repeat(20), tokens: 100}],
  version: 1,
}).transaction;

const lockedId = idForTransaction({transaction: lockedTransaction}).id;
const noRawTxId = 'dd'.repeat(32);
const unconfirmedId = idForTransaction({transaction: unconfirmedTransaction}).id;

const makeChainTx = overrides => {
  const tx = {
    amount: '1',
    block_hash: Buffer.alloc(32).toString('hex'),
    block_height: 1,
    dest_addresses: ['mk2QpYatsKicvFVuTAQLBryyccRXMUaGHP'],
    num_confirmations: 1,
    previous_outpoints: [],
    time_stamp: '1',
    total_fees: '1',
  };

  Object.keys(overrides).forEach(k => tx[k] = overrides[k]);

  return tx;
};

const makeLease = overrides => {
  const lease = {
    expiration: 4000000000,
    id: Buffer.alloc(32),
    outpoint: {output_index: 0, txid_str: lockedId},
    pk_script: Buffer.from('0014' + '22'.repeat(20), 'hex'),
    value: '7777',
  };

  Object.keys(overrides).forEach(k => lease[k] = overrides[k]);

  return lease;
};

const makeLockedLnd = () => {
  const lnd = makeLnd({
    getChainTransactions: ({}, cbk) => cbk(null, {
      transactions: [
        makeChainTx({raw_tx_hex: lockedTransaction, tx_hash: lockedId}),
        makeChainTx({tx_hash: noRawTxId}),
        makeChainTx({
          block_hash: '',
          block_height: 0,
          num_confirmations: 0,
          raw_tx_hex: unconfirmedTransaction,
          tx_hash: unconfirmedId,
        }),
      ],
    }),
  });

  lnd.wallet.listLeases = ({}, cbk) => cbk(null, {
    locked_utxos: [
      makeLease({}),
      makeLease({expiration: 1}),
      makeLease({outpoint: {output_index: 0, txid_str: 'bb'.repeat(32)}}),
      makeLease({outpoint: {output_index: 0, txid_str: noRawTxId}}),
      makeLease({outpoint: {output_index: 0, txid_str: unconfirmedId}}),
      makeLease({outpoint: {output_index: 5, txid_str: lockedId}}),
    ],
  });

  return lnd;
};

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
  {
    args: {lnd: makeLockedLnd()},
    description: 'Locked utxos with valid leases are counted in the balance',
    expected: {
      closing_balance: 0,
      conflicted_pending: 0,
      invalid_pending: 0,
      offchain_balance: 2,
      offchain_pending: 0,
      onchain_confirmed: 7778,
      onchain_pending: 0,
      onchain_vbytes: 144,
      utxos_count: 1
    },
  },
  {
    args: {is_confirmed: true, lnd: makeLockedLnd()},
    description: 'Confirmed balances are returned',
    expected: {
      closing_balance: 0,
      conflicted_pending: 0,
      invalid_pending: 0,
      offchain_balance: 2,
      offchain_pending: 0,
      onchain_confirmed: 7778,
      onchain_pending: 0,
      onchain_vbytes: 144,
      utxos_count: 1
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
