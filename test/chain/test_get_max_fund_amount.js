const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');
const {createPsbt} = require('psbt');

const {makeLnd} = require('mock-lnd');

const method = require('./../../chain/get_max_fund_amount');

const transactionId = 'ab'.repeat(32);

// The template PSBT has a funding output and a change output
const template = createPsbt({
  outputs: [
    {script: '0014' + '33'.repeat(20), tokens: 546},
    {script: '0014' + '44'.repeat(20), tokens: 1000},
  ],
  utxos: [{id: transactionId, sequence: 0, vout: 0}],
});

// The signed maximum spending transaction pays out 48k of the 50k input
const finalTransaction = '0100000001abababababababababababababababababababababababababababababababab0000000000000000000180bb000000000000160014333333333333333333333333333333333333333300000000';

const makeFundResponse = ({}) => ({
  change_output_index: 1,
  funded_psbt: Buffer.from(template.psbt, 'hex'),
  locked_utxos: [{
    expiration: 1,
    id: Buffer.alloc(32),
    outpoint: {
      output_index: 0,
      txid_bytes: Buffer.from(transactionId, 'hex').reverse(),
    },
  }],
});

const makeFundingLnd = ({failures}) => {
  let calls = 0;

  return makeLnd({
    fundPsbt: ({}, cbk) => {
      calls++;

      // Exit early with an error when this funding attempt should fail
      if ((failures || []).includes(calls)) {
        return cbk({message: 'FailedToFund'});
      }

      return cbk(null, makeFundResponse({}));
    },
    signPsbt: ({}, cbk) => cbk(null, {
      raw_final_tx: Buffer.from(finalTransaction, 'hex'),
      signed_psbt: Buffer.from(template.psbt, 'hex'),
    }),
  });
};

const makeArgs = overrides => {
  const args = {
    addresses: ['bc1qxvckqxvcqq'],
    fee_tokens_per_vbyte: 2,
    inputs: [{
      tokens: 50000,
      transaction_id: transactionId,
      transaction_vout: 0,
    }],
    lnd: makeFundingLnd({}),
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const tests = [
  {
    args: makeArgs({addresses: undefined}),
    description: 'Addresses are required to get the max fund amount',
    error: [400, 'ExpectedArrayOfAddressesToCalculateMaxFunding'],
  },
  {
    args: makeArgs({fee_tokens_per_vbyte: undefined}),
    description: 'A fee rate is required to get the max fund amount',
    error: [400, 'ExpectedFeeTokensToCalculateMaxFundAmount'],
  },
  {
    args: makeArgs({inputs: undefined}),
    description: 'Inputs are required to get the max fund amount',
    error: [400, 'ExpectedArrayOfInputsToCalculateMaxFundAmount'],
  },
  {
    args: makeArgs({lnd: undefined}),
    description: 'An lnd object is required to get the max fund amount',
    error: [400, 'ExpectedAuthenticatedLndApiToCalcMaxFundAmount'],
  },
  {
    args: makeArgs({}),
    description: 'The maximum fundable amount is calculated',
    expected: {
      fee_tokens_per_vbyte: 24.390243902439025,
      max_tokens: 48000,
    },
  },
  {
    args: makeArgs({lnd: makeFundingLnd({failures: [2]})}),
    description: 'A dust adjusted maximum is used when the normal max fails',
    expected: {
      fee_tokens_per_vbyte: 24.390243902439025,
      max_tokens: 48000,
    },
  },
  {
    args: makeArgs({addresses: ['bc1qxvckqxvcqq', 'bc1qxvckqxvcqq']}),
    description: 'Secondary addresses are given dust outputs',
    expected: {
      fee_tokens_per_vbyte: 24.390243902439025,
      max_tokens: 48000,
    },
  },
  {
    args: makeArgs({
      addresses: ['bc1qxvckqxvcqq', 'bc1qxvckqxvcqq'],
      lnd: makeFundingLnd({failures: [2]}),
    }),
    description: 'Secondary addresses get dust in the adjusted maximum too',
    expected: {
      fee_tokens_per_vbyte: 24.390243902439025,
      max_tokens: 48000,
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
