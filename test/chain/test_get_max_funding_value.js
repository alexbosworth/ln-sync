const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const {componentsOfTransaction} = require('@alexbosworth/blockchain');
const {createPsbt} = require('psbt');
const {decodePsbt} = require('psbt');
const {extendPsbt} = require('psbt');

const method = require('./../../chain/get_max_funding_value');

const defaultMaxFeeRatio = 0.2;
const fixedScript = '0014' + '22'.repeat(20);
const {floor} = Math;
const lockId = '11'.repeat(32);
const malformedPsbt = tx => '70736274ff0100' +
  (tx.length / 2).toString(16).padStart(2, '0') + tx + '00010101000000';
const nestedScript = 'a914' + '33'.repeat(20) + '87';
const noCoinSelection = 2147483647;
const p2pkhScript = '76a914' + '66'.repeat(20) + '88ac';
const p2trScript = '5120' + '44'.repeat(32);
const p2wpkhScript = '0014' + '55'.repeat(20);
const sumOf = arr => arr.reduce((sum, n) => sum + n, 0);
const transactionId = 'ab'.repeat(32);
const unsupported = 'transaction template missing, need to specify either ' +
  'PSBT or raw TX template';
const vbytesPerKw = 250;
const weightUnitsPerKw = 1e3;

// Fund the template like LND does, the leftover after the fee is the change
const makeLnd = args => {
  const {added, err, malformed, release, reorder, undecorated} = args;
  const {utxos, weight} = args;

  return {
    wallet: {
      fundPsbt: (req, cbk) => {
        // LND only takes inputs that are not locked when it can't add coins
        const isLocking = req.min_confs !== noCoinSelection;

        if (!!err || isLocking) {
          return cbk(err || {details: 'input is not locked'});
        }

        const template = decodePsbt({
          psbt: req.coin_select.psbt.toString('hex'),
        });

        const tx = componentsOfTransaction({
          transaction: template.unsigned_transaction,
        });

        // LND rounds the fee down by weight
        const perKw = req.sat_per_kw || req.sat_per_vbyte * vbytesPerKw;

        const fee = floor(perKw * weight / weightUnitsPerKw);
        const outTokens = sumOf(tx.outputs.map(n => n.tokens));

        const change = sumOf(utxos.map(n => n.tokens)) - outTokens - fee;

        if (change < 0) {
          return cbk({details: 'not enough witness outputs'});
        }

        const total = outTokens + change;

        // LND caps the fee at a ratio of the total output value
        const ratio = req.max_fee_ratio || defaultMaxFeeRatio;

        if (fee > floor(ratio * total)) {
          return cbk({details: `fee ${fee} on total output value ${total}`});
        }

        const index = req.coin_select.existing_output_index;

        const outputs = tx.outputs.map((output, i) => ({
          script: output.script,
          tokens: i === index ? output.tokens + change : output.tokens,
        }));

        const spending = tx.inputs.map(n => ({id: n.id, vout: n.vout}));

        const {psbt} = createPsbt({
          outputs: !!reorder ? outputs.slice().reverse() : outputs,
          utxos: spending.concat(added || []),
        });

        const inputs = utxos.map(witness_utxo => ({witness_utxo}));

        const extended = extendPsbt({inputs, psbt}).psbt;

        const decorated = !!undecorated ? psbt : extended;

        const unsigned = decodePsbt({psbt}).unsigned_transaction;

        const funded = !!malformed ? malformedPsbt(unsigned) : decorated;

        return cbk(null, {
          change_output_index: index,
          funded_psbt: Buffer.from(funded, 'hex'),
          locked_utxos: (added || []).map(({vout}) => ({
            expiration: '1800000000',
            id: Buffer.from(lockId, 'hex'),
            outpoint: {
              output_index: vout,
              txid_bytes: Buffer.from(transactionId, 'hex').reverse(),
            },
          })),
        });
      },
      releaseOutput: ({}, cbk) => cbk(release),
    },
  };
};

const makeArgs = overrides => {
  const args = {
    fee_tokens_per_vbyte: 3,
    inputs: [{transaction_id: transactionId, transaction_vout: 0}],
    lnd: makeLnd({
      utxos: [{script_pub: p2wpkhScript, tokens: 5e9}],
      weight: 487,
    }),
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const tests = [
  {
    args: makeArgs({change_format: 'p2wpkh'}),
    description: 'A known change format is required',
    error: [400, 'ExpectedKnownChangeFormatToGetMaxFundingValue'],
  },
  {
    args: makeArgs({change_format: 'p2tr', output_script: p2wpkhScript}),
    description: 'A change format and an output script are exclusive',
    error: [400, 'ExpectedEitherChangeFormatOrOutputScriptNotBoth'],
  },
  {
    args: makeArgs({fee_tokens_per_vbyte: undefined}),
    description: 'A fee rate is required',
    error: [400, 'ExpectedFeeRateToCalculateMaxFundingValue'],
  },
  {
    args: makeArgs({fee_mtokens_per_vbyte: 3000}),
    description: 'Only one fee rate can be specified',
    error: [400, 'ExpectedEitherFeeMtokensOrTokensPerVbyteNotBoth'],
  },
  {
    args: makeArgs({
      fee_mtokens_per_vbyte: 2.5,
      fee_tokens_per_vbyte: undefined,
    }),
    description: 'A millitokens fee rate is a whole number',
    error: [400, 'ExpectedPositiveFeeMtokensPerVbyteForMaxFunding'],
  },
  {
    args: makeArgs({
      fee_mtokens_per_vbyte: '2500',
      fee_tokens_per_vbyte: undefined,
    }),
    description: 'A millitokens fee rate is a number',
    error: [400, 'ExpectedPositiveFeeMtokensPerVbyteForMaxFunding'],
  },
  {
    args: makeArgs({fee_tokens_per_vbyte: -1}),
    description: 'A tokens fee rate is positive',
    error: [400, 'ExpectedPositiveFeeTokensPerVbyteForMaxFunding'],
  },
  {
    args: makeArgs({inputs: undefined}),
    description: 'Inputs are required',
    error: [400, 'ExpectedArrayOfInputsToCalculateMaxFundingValue'],
  },
  {
    args: makeArgs({inputs: []}),
    description: 'At least one input is required',
    error: [400, 'ExpectedArrayOfInputsToCalculateMaxFundingValue'],
  },
  {
    args: makeArgs({inputs: [null]}),
    description: 'Inputs are required to be present',
    error: [400, 'ExpectedOutpointsForInputsToGetMaxFundingValue'],
  },
  {
    args: makeArgs({inputs: [{transaction_id: 'id', transaction_vout: 0}]}),
    description: 'Inputs are required to be outpoints',
    error: [400, 'ExpectedOutpointsForInputsToGetMaxFundingValue'],
  },
  {
    args: makeArgs({lnd: undefined}),
    description: 'LND is required',
    error: [400, 'ExpectedAuthenticatedLndApiToCalcMaxFundingVal'],
  },
  {
    args: makeArgs({output_script: 'script'}),
    description: 'An output script must be hex',
    error: [400, 'ExpectedHexOutputScriptToGetMaxFundingValue'],
  },
  {
    args: makeArgs({outputs: 'outputs'}),
    description: 'Outputs must be an array',
    error: [400, 'ExpectedArrayOfOutputsToCalcMaxFundingValue'],
  },
  {
    args: makeArgs({outputs: [null]}),
    description: 'Outputs are required to be present',
    error: [400, 'ExpectedScriptAndTokensInOutputsForMaxFunding'],
  },
  {
    args: makeArgs({outputs: [{script: fixedScript, tokens: -1}]}),
    description: 'Outputs are required to have a script and tokens',
    error: [400, 'ExpectedScriptAndTokensInOutputsForMaxFunding'],
  },
  {
    // LND pays 365 for 487 weight at 3/vbyte, 1 short of 366 for 122 vbytes
    args: makeArgs({}),
    description: 'The rounded down fee is topped up to pay for every vbyte',
    expected: {fee_tokens_per_vbyte: 3, max_tokens: 4999999634},
  },
  {
    args: makeArgs({
      fee_tokens_per_vbyte: 10,
      lnd: makeLnd({
        utxos: [{script_pub: p2trScript, tokens: 1e6}],
        weight: 444,
      }),
    }),
    description: 'A P2TR input max is calculated',
    expected: {fee_tokens_per_vbyte: 10, max_tokens: 998890},
  },
  {
    args: makeArgs({
      fee_tokens_per_vbyte: 2.5,
      lnd: makeLnd({
        utxos: [{script_pub: p2trScript, tokens: 1e6}],
        weight: 444,
      }),
    }),
    description: 'A fractional fee rate is paid for every vbyte',
    expected: {fee_tokens_per_vbyte: 278 / 111, max_tokens: 999722},
  },
  {
    args: makeArgs({
      fee_mtokens_per_vbyte: 2500,
      fee_tokens_per_vbyte: undefined,
      lnd: makeLnd({
        utxos: [{script_pub: p2trScript, tokens: 1e6}],
        weight: 444,
      }),
    }),
    description: 'A millitokens fee rate is paid for every vbyte',
    expected: {fee_tokens_per_vbyte: 278 / 111, max_tokens: 999722},
  },
  {
    args: makeArgs({
      fee_tokens_per_vbyte: 1.1,
      lnd: makeLnd({
        utxos: [{script_pub: p2wpkhScript, tokens: 5e9}],
        weight: 439,
      }),
      output_script: p2wpkhScript,
    }),
    description: 'A fractional tokens fee rate has no float noise',
    expected: {fee_tokens_per_vbyte: 121 / 110, max_tokens: 4999999879},
  },
  {
    args: makeArgs({
      fee_tokens_per_vbyte: 1.0011,
      lnd: makeLnd({
        utxos: [{script_pub: p2trScript, tokens: 1e6}],
        weight: 444,
      }),
    }),
    description: 'A tokens fee rate finer than mtokens is rounded up',
    expected: {fee_tokens_per_vbyte: 112 / 111, max_tokens: 999888},
  },
  {
    args: makeArgs({
      lnd: makeLnd({
        utxos: [{script_pub: p2wpkhScript, tokens: 5e9}],
        weight: 439,
      }),
      output_script: p2wpkhScript,
    }),
    description: 'A max output script is sized exactly',
    expected: {fee_tokens_per_vbyte: 3, max_tokens: 4999999670},
  },
  {
    args: makeArgs({
      lnd: makeLnd({
        utxos: [{script_pub: p2wpkhScript, tokens: 5e9}],
        weight: 439,
      }),
      output_script: p2wpkhScript.toUpperCase(),
    }),
    description: 'An upper case max output script is used',
    expected: {fee_tokens_per_vbyte: 3, max_tokens: 4999999670},
  },
  {
    args: makeArgs({
      fee_tokens_per_vbyte: 5,
      lnd: makeLnd({
        utxos: [{script_pub: nestedScript, tokens: 2e6}],
        weight: 579,
      }),
    }),
    description: 'A nested SegWit input max is calculated',
    expected: {fee_tokens_per_vbyte: 5, max_tokens: 1999275},
  },
  {
    args: makeArgs({
      fee_tokens_per_vbyte: 7,
      inputs: [0, 1, 2].map(vout => ({
        transaction_id: transactionId,
        transaction_vout: vout,
      })),
      lnd: makeLnd({
        utxos: [
          {script_pub: p2trScript, tokens: 25000},
          {script_pub: nestedScript, tokens: 50000},
          {script_pub: p2wpkhScript, tokens: 15000},
        ],
        weight: 1206,
      }),
      outputs: [{script: fixedScript, tokens: 20000}],
    }),
    description: 'Multiple inputs and outputs max is calculated',
    expected: {fee_tokens_per_vbyte: 7, max_tokens: 67886},
  },
  {
    args: makeArgs({
      lnd: makeLnd({
        utxos: [{script_pub: p2wpkhScript, tokens: 5e9}],
        weight: 611,
      }),
      outputs: [{script: fixedScript, tokens: 1000}],
    }),
    description: 'Other outputs are paid before the max output',
    expected: {fee_tokens_per_vbyte: 3, max_tokens: 4999998541},
  },
  {
    args: makeArgs({
      fee_tokens_per_vbyte: 30,
      lnd: makeLnd({
        utxos: [{script_pub: p2trScript, tokens: 9000}],
        weight: 444,
      }),
      max_fee_ratio: 0.6,
    }),
    description: 'A max fee ratio allows for a higher fee',
    expected: {fee_tokens_per_vbyte: 30, max_tokens: 5670},
  },
  {
    args: makeArgs({
      fee_tokens_per_vbyte: 30,
      lnd: makeLnd({
        utxos: [{script_pub: p2trScript, tokens: 9000}],
        weight: 444,
      }),
    }),
    description: 'Excessive fees are reported',
    error: [
      400,
      'MaxFeeRatioExceededForMaxFunding',
      {details: 'fee 3330 on total output value 5670'},
    ],
  },
  {
    // LND accepts the 365 fee on 1829 but the topped up 366 on 1828 is over
    args: makeArgs({
      lnd: makeLnd({
        utxos: [{script_pub: p2wpkhScript, tokens: 2194}],
        weight: 487,
      }),
    }),
    description: 'A fee topped up past the fee cap is reported',
    error: [400, 'MaxFeeRatioExceededForMaxFunding', {fee: 366, max_fee: 365}],
  },
  {
    args: makeArgs({
      lnd: makeLnd({
        utxos: [{script_pub: p2wpkhScript, tokens: 2194}],
        weight: 487,
      }),
      max_fee_ratio: 0.25,
    }),
    description: 'A topped up fee is allowed under a higher fee cap',
    expected: {fee_tokens_per_vbyte: 3, max_tokens: 1828},
  },
  {
    args: makeArgs({
      fee_tokens_per_vbyte: 1,
      lnd: makeLnd({
        utxos: [{script_pub: p2trScript, tokens: 1e4}],
        weight: 568,
      }),
      outputs: [{script: fixedScript, tokens: 9600}],
    }),
    description: 'A dust max is rejected',
    error: [400, 'MaxFundingValueIsBelowDustValue', {max_tokens: 258}],
  },
  {
    args: makeArgs({
      fee_tokens_per_vbyte: 1,
      lnd: makeLnd({
        utxos: [{script_pub: p2trScript, tokens: 1e4}],
        weight: 532,
      }),
      output_script: p2pkhScript,
      outputs: [{script: fixedScript, tokens: 9400}],
    }),
    description: 'The dust value is for the max output script',
    error: [400, 'MaxFundingValueIsBelowDustValue', {max_tokens: 467}],
  },
  {
    args: makeArgs({
      lnd: makeLnd({
        utxos: [{script_pub: p2trScript, tokens: 9000}],
        weight: 568,
      }),
      outputs: [{script: fixedScript, tokens: 9000}],
    }),
    description: 'Insufficient inputs are reported',
    error: [400, 'InsufficientFundsToCalculateMaxFundingValue'],
  },
  {
    args: makeArgs({lnd: makeLnd({err: {details: 'missing UTXO info'}})}),
    description: 'Inputs not in the wallet are reported',
    error: [400, 'ExpectedWalletUtxoInputsToGetMaxFundingValue'],
  },
  {
    args: makeArgs({
      lnd: makeLnd({err: {details: 'error parsing change script'}}),
      output_script: '6a',
    }),
    description: 'An output script that LND cannot use is reported',
    error: [400, 'UnsupportedOutputScriptToGetMaxFundingValue'],
  },
  {
    args: makeArgs({lnd: makeLnd({err: {details: unsupported}})}),
    description: 'Older LND versions are not supported',
    error: [501, 'CreateFundedPsbtMethodNotSupported'],
  },
  {
    args: makeArgs({lnd: makeLnd({err: {details: 'err'}})}),
    description: 'Unexpected errors are passed back',
    error: [503, 'UnexpectedErrorCreatingFundedPsbt', {err: {details: 'err'}}],
  },
  {
    args: makeArgs({
      lnd: makeLnd({
        added: [{id: transactionId, vout: 1}],
        utxos: [
          {script_pub: p2wpkhScript, tokens: 5e9},
          {script_pub: p2wpkhScript, tokens: 5e9},
        ],
        weight: 487,
      }),
    }),
    description: 'Wallet coins added to the template are not expected',
    error: [503, 'UnexpectedInputCountInFundedMaxValueTemplate'],
  },
  {
    args: makeArgs({
      lnd: makeLnd({
        added: [{id: transactionId, vout: 1}],
        release: 'err',
        utxos: [
          {script_pub: p2wpkhScript, tokens: 5e9},
          {script_pub: p2wpkhScript, tokens: 5e9},
        ],
        weight: 487,
      }),
    }),
    description: 'Wallet coins added to the template are released',
    error: [503, 'UnexpectedErrorUnlockingUtxo', {err: 'err'}],
  },
  {
    args: makeArgs({
      lnd: makeLnd({
        undecorated: true,
        utxos: [{script_pub: p2wpkhScript, tokens: 5e9}],
        weight: 487,
      }),
    }),
    description: 'Inputs should be decorated with their UTXO details',
    error: [503, 'ExpectedWitnessUtxosInFundedMaxValueTemplate'],
  },
  {
    args: makeArgs({
      lnd: makeLnd({
        malformed: true,
        utxos: [{script_pub: p2wpkhScript, tokens: 5e9}],
        weight: 487,
      }),
    }),
    description: 'The funded template is expected to be a valid PSBT',
    error: [
      503,
      'FailedToDecodeFundedMaxValuePsbt',
      {err: 'ExpectedScriptPubLengthForWitnessUtxo'},
    ],
  },
  {
    args: makeArgs({
      lnd: makeLnd({
        reorder: true,
        utxos: [{script_pub: p2wpkhScript, tokens: 5e9}],
        weight: 611,
      }),
      outputs: [{script: fixedScript, tokens: 1000}],
    }),
    description: 'The change output is expected where it was placed',
    error: [503, 'ExpectedChangeOutputInFundedMaxValueTemplate'],
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
