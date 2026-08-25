const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');
const {componentsOfTransaction} = require('@alexbosworth/blockchain');
const {decodePsbt} = require('psbt');
const tinysecp = require('tiny-secp256k1');

const method = require('./../../funding/assemble_unsigned_psbt');

const makeArgs = overrides => {
  const args = {
    capacity: 1000000,
    proposed: [
      {
        change: '0014' + '66'.repeat(20),
        funding: ['0020' + '77'.repeat(32)],
        utxos: [{
          transaction_id: 'ab'.repeat(32),
          transaction_vout: 0,
          witness_utxo: {
            script_pub: '0014' + '88'.repeat(20),
            tokens: 5000000,
          },
        }],
      },
      {
        change: '0014' + '99'.repeat(20),
        funding: ['0020' + '77'.repeat(32)],
        utxos: [{
          transaction_id: 'cd'.repeat(32),
          transaction_vout: 1,
          witness_utxo: {
            script_pub: '5120' + 'aa'.repeat(32),
            tokens: 6000000,
          },
        }],
      },
    ],
    rate: 2,
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const sortOutputs = outputs => outputs.slice().sort((a, b) => {
  return a.tokens - b.tokens || (a.script < b.script ? -1 : 1);
});

const tests = [
  {
    args: makeArgs({capacity: undefined}),
    description: 'A capacity is required to assemble an unsigned psbt',
    error: [400, 'ExpectedCapacityToAssembleUnsignedPsbt'],
  },
  {
    args: makeArgs({proposed: undefined}),
    description: 'Proposals are required to assemble an unsigned psbt',
    error: [400, 'ExpectedChannelProposalsToAssembleUnsignedPsbt'],
  },
  {
    args: makeArgs({rate: undefined}),
    description: 'A chain fee rate is required to assemble an unsigned psbt',
    error: [400, 'ExpectedChainFeeRateToAssembleUnsignedPsbt'],
  },
  {
    args: makeArgs({}),
    description: 'A pair channel proposal is assembled into an unsigned psbt',
    expected: {
      inputs: [
        {id: 'ab'.repeat(32), vout: 0},
        {id: 'cd'.repeat(32), vout: 1},
      ],
      outputs: [
        {script: '0020' + '77'.repeat(32), tokens: 1000000},
        {script: '0020' + '77'.repeat(32), tokens: 1000000},
        {script: '0014' + '66'.repeat(20), tokens: 4499747},
        {script: '0014' + '99'.repeat(20), tokens: 5499769},
      ],
      utxos: [
        {script_pub: '0014' + '88'.repeat(20), tokens: 5000000},
        {script_pub: '5120' + 'aa'.repeat(32), tokens: 6000000},
      ],
    },
  },
  {
    args: makeArgs({
      proposed: [{
        change: '0014' + '66'.repeat(20),
        funding: undefined,
        utxos: [{
          transaction_id: 'ab'.repeat(32),
          transaction_vout: 0,
          witness_utxo: {
            script_pub: '0014' + '88'.repeat(20),
            tokens: 5000000,
          },
        }],
      }],
      rate: 1,
    }),
    description: 'A single member proposal without funding has just change',
    expected: {
      inputs: [{id: 'ab'.repeat(32), vout: 0}],
      outputs: [{script: '0014' + '66'.repeat(20), tokens: 3999847}],
      utxos: [{script_pub: '0014' + '88'.repeat(20), tokens: 5000000}],
    },
  },
  {
    args: makeArgs({
      proposed: [{
        change: undefined,
        funding: ['0020' + '77'.repeat(32)],
        utxos: [{
          transaction_id: 'ab'.repeat(32),
          transaction_vout: 0,
          witness_utxo: {
            script_pub: '0014' + '88'.repeat(20),
            tokens: 5000000,
          },
        }],
      }],
      rate: 1,
    }),
    description: 'A member proposal without change has just funding',
    expected: {
      inputs: [{id: 'ab'.repeat(32), vout: 0}],
      outputs: [{script: '0020' + '77'.repeat(32), tokens: 1000000}],
      utxos: [{script_pub: '0014' + '88'.repeat(20), tokens: 5000000}],
    },
  },
  {
    args: makeArgs({
      proposed: [{
        change: '0014' + '66'.repeat(20),
        funding: ['0020' + '77'.repeat(32)],
        utxos: [{
          transaction_id: 'ab'.repeat(32),
          transaction_vout: 0,
          witness_utxo: {
            script_pub: '76a914' + '88'.repeat(20) + '88ac',
            tokens: 5000000,
          },
        }],
      }],
    }),
    description: 'A non segwit utxo is not supported',
    error: 'UnsupportedOutputType',
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    if (!!error) {
      await rejects(method(args), Array.isArray(error) ? error : new Error(error));

      return;
    }

    const ecp = (await import('ecpair')).ECPairFactory(tinysecp);

    const {psbt} = await method(args);

    const decoded = decodePsbt({ecp, psbt});

    const tx = componentsOfTransaction({
      transaction: decoded.unsigned_transaction,
    });

    // The inputs and outputs are randomly shuffled so sort them to compare
    const inputs = tx.inputs
      .map(n => ({id: n.id, vout: n.vout}))
      .sort((a, b) => a.id < b.id ? -1 : 1);

    const utxos = decoded.inputs
      .map(n => n.witness_utxo)
      .sort((a, b) => a.tokens - b.tokens);

    deepEqual(inputs, expected.inputs, 'Got expected transaction inputs');
    deepEqual(sortOutputs(tx.outputs), expected.outputs, 'Got outputs');
    deepEqual(utxos, expected.utxos, 'Got expected witness utxos');

    return;
  });
});
