const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');
const {componentsOfTransaction} = require('@alexbosworth/blockchain');
const {decodePsbt} = require('psbt');

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

// Make a proposal that funds a channel from a single P2WPKH UTXO
const makeProposal = ({change, tokens}) => [{
  change,
  funding: ['0020' + '77'.repeat(32)],
  utxos: [{
    transaction_id: 'ab'.repeat(32),
    transaction_vout: 0,
    witness_utxo: {script_pub: '0014' + '88'.repeat(20), tokens},
  }],
}];

const p2pkhScript = '76a914' + '66'.repeat(20) + '88ac';

const sumOf = arr => arr.reduce((sum, n) => sum + n, 0);

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
    error: [
      400,
      'FailedToDeriveOutputsForPsbt',
      {err: 'UnsupportedOutputType'},
    ],
  },
  {
    args: makeArgs({
      proposed: [{
        funding: ['0020' + '77'.repeat(32)],
        utxos: [{
          transaction_id: 'ab'.repeat(32),
          transaction_vout: 0,
          witness_utxo: {
            script_pub: '0014' + '88'.repeat(20),
            tokens: 1000000,
          },
        }],
      }],
    }),
    description: 'Proposed utxos must cover the funding and the fee',
    error: [
      400,
      'FailedToDeriveOutputsForPsbt',
      {err: 'ExpectedSufficientFundsInProposedUtxos'},
    ],
  },
  {
    // The fee is 306, leaving 293 of change: 1 short of P2WPKH dust
    args: makeArgs({
      proposed: makeProposal({
        change: '0014' + '66'.repeat(20),
        tokens: 1000599,
      }),
    }),
    description: 'Change is required to be above the dust value',
    error: [
      400,
      'FailedToDeriveOutputsForPsbt',
      {err: 'ExpectedChangeAboveDustInProposedUtxos'},
    ],
  },
  {
    // The fee is 312, leaving 545 of change: 1 short of P2PKH dust
    args: makeArgs({
      proposed: makeProposal({
        change: p2pkhScript,
        tokens: 1000857,
      }),
    }),
    description: 'Legacy change is required to be above its dust value',
    error: [
      400,
      'FailedToDeriveOutputsForPsbt',
      {err: 'ExpectedChangeAboveDustInProposedUtxos'},
    ],
  },
  {
    // Upper case hex is the same script, with the same P2PKH dust value
    args: makeArgs({
      proposed: makeProposal({
        change: p2pkhScript.toUpperCase(),
        tokens: 1000857,
      }),
    }),
    description: 'Upper case change has the same dust value',
    error: [
      400,
      'FailedToDeriveOutputsForPsbt',
      {err: 'ExpectedChangeAboveDustInProposedUtxos'},
    ],
  },
  {
    // The fee is 332, leaving 575 of change: 1 short of P2PK dust
    args: makeArgs({
      proposed: makeProposal({
        change: '21' + '02'.repeat(33) + 'ac',
        tokens: 1000907,
      }),
    }),
    description: 'Pay to public key change has a legacy dust value',
    error: [
      400,
      'FailedToDeriveOutputsForPsbt',
      {err: 'ExpectedChangeAboveDustInProposedUtxos'},
    ],
  },
  {
    // The fee is 396, leaving 671 of change: 1 short of long P2PK dust
    args: makeArgs({
      proposed: makeProposal({
        change: '41' + '04'.repeat(65) + 'ac',
        tokens: 1001067,
      }),
    }),
    description: 'Uncompressed public key change has a legacy dust value',
    error: [
      400,
      'FailedToDeriveOutputsForPsbt',
      {err: 'ExpectedChangeAboveDustInProposedUtxos'},
    ],
  },
  {
    // The fee is 306, leaving 536 of change: 1 short of the legacy dust
    args: makeArgs({
      proposed: makeProposal({
        change: '6a14' + '66'.repeat(20),
        tokens: 1000842,
      }),
    }),
    description: 'A data push change is not a witness program',
    error: [
      400,
      'FailedToDeriveOutputsForPsbt',
      {err: 'ExpectedChangeAboveDustInProposedUtxos'},
    ],
  },
  {
    args: makeArgs({
      proposed: [{
        change: '0014' + '66'.repeat(20),
        funding: ['0020' + '77'.repeat(32)],
        utxos: [{
          non_witness_utxo: 'transaction',
          transaction_id: 'ab'.repeat(32),
          transaction_vout: 0,
          witness_utxo: {
            script_pub: '0014' + '88'.repeat(20),
            tokens: 5000000,
          },
        }],
      }],
    }),
    description: 'Proposed utxo spending transactions must be valid',
    error: [
      400,
      'FailedToAssembleUnsignedPsbt',
      {err: 'ExpectedHexValueToExtendPsbt'},
    ],
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    if (!!error) {
      await rejects(method(args), error, 'Got expected error');

      return;
    }

    const {psbt} = await method(args);

    const decoded = decodePsbt({psbt});

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

    // The outputs can never spend more than the inputs
    deepEqual(
      sumOf(tx.outputs.map(n => n.tokens)) < sumOf(utxos.map(n => n.tokens)),
      true,
      'Outputs spend less than the inputs'
    );

    return;
  });
});
