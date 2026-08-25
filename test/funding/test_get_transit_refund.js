const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const {makeLnd} = require('mock-lnd');

const method = require('./../../funding/get_transit_refund');

const p2pkhAddress = '1jU2ZiwRwvA6oxkbqz1opzaxWMFyovCBf';
const p2shAddress = '32Wnq4482y6gaTH9vYmjaorU6iZFt2Tonc';
const publicKey = '03e15819590382a9dd878f01e2f0cbce541564eb415e43b440472d883ecd283058';
const refundAddress = 'bc1qqurswpc8qurswpc8qurswpc8qurswpc89fe3yv';
const transitAddress = 'bc1qcv905k9wqeemqzj9khqhml6xxduq79qqy745vn';
const unknownVersionAddress = 'M8pF1tJq3CpFmSB2E2tCkobpR74zBsBDmi';

const makeSignerLnd = () => {
  const lnd = makeLnd({});

  lnd.signer = {
    signOutputRaw: (args, cbk) => cbk(null, {raw_sigs: [Buffer.alloc(71, 1)]}),
  };

  return lnd;
};

const makeArgs = overrides => {
  const args = {
    funded_tokens: 100000,
    lnd: makeSignerLnd(),
    network: 'btc',
    refund_address: refundAddress,
    transit_address: transitAddress,
    transit_key_index: 3,
    transit_public_key: publicKey,
    transaction_id: 'aa'.repeat(32),
    transaction_vout: 1,
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

// The signed refund transactions only differ in their output scripts
const makeRefund = script => [
  '01000000000101',
  'aa'.repeat(32),
  '010000000000000000013286010000000000',
  script,
  '0248',
  '01'.repeat(71),
  '0121',
  publicKey,
  '00000000',
].join('');

const tests = [
  {
    args: makeArgs({funded_tokens: undefined}),
    description: 'Funded tokens are required to get a transit refund',
    error: [400, 'ExpectedFundedTokensCountToGetTransitRefund'],
  },
  {
    args: makeArgs({lnd: undefined}),
    description: 'An lnd object is required to get a transit refund',
    error: [400, 'ExpectedAuthenticatedLndToGetTransitRefund'],
  },
  {
    args: makeArgs({network: 'network'}),
    description: 'A known network is required to get a transit refund',
    error: [400, 'ExpectedKnownNetworkNameToGetTransitRefund'],
  },
  {
    args: makeArgs({refund_address: undefined}),
    description: 'A refund address is required to get a transit refund',
    error: [400, 'ExpectedRefundAddressToGetTransitFundsRefund'],
  },
  {
    args: makeArgs({transit_address: undefined}),
    description: 'A transit address is required to get a transit refund',
    error: [400, 'ExpectedTransitAddressToGetTransitFundsRefund'],
  },
  {
    args: makeArgs({transit_key_index: undefined}),
    description: 'A transit key index is required to get a transit refund',
    error: [400, 'ExpectedTransitKeyIndexToGetTransitFundsRefund'],
  },
  {
    args: makeArgs({transit_public_key: undefined}),
    description: 'A transit public key is required to get a transit refund',
    error: [400, 'ExpectedTransitPublicKeyToGetTransitFundsRefund'],
  },
  {
    args: makeArgs({transaction_id: undefined}),
    description: 'A transaction id is required to get a transit refund',
    error: [400, 'ExpectedTransactionIdToGetTransitFundsRefund'],
  },
  {
    args: makeArgs({transaction_vout: undefined}),
    description: 'A transaction vout is required to get a transit refund',
    error: [400, 'ExpectedTransactionVoutToGetTransitFundsRefund'],
  },
  {
    args: makeArgs({refund_address: unknownVersionAddress}),
    description: 'A known refund address type is required for a refund',
    error: [400, 'ExpectedValidRefundAddressToGetTransitRefund'],
  },
  {
    args: makeArgs({}),
    description: 'A refund to a bech32 address is signed',
    expected: {
      refund: makeRefund('160014' + '07'.repeat(20)),
    },
  },
  {
    args: makeArgs({refund_address: p2pkhAddress}),
    description: 'A refund to a p2pkh address is signed',
    expected: {
      refund: makeRefund('1976a914' + '08'.repeat(20) + '88ac'),
    },
  },
  {
    args: makeArgs({refund_address: p2shAddress}),
    description: 'A refund to a p2sh address is signed',
    expected: {
      refund: makeRefund('17a914' + '09'.repeat(20) + '87'),
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
