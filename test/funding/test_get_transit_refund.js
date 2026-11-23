const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const {makeLnd} = require('mock-lnd');

const method = require('./../../funding/get_transit_refund');

const p2pkhAddress = '1jU2ZiwRwvA6oxkbqz1opzaxWMFyovCBf';
const p2shAddress = '32Wnq4482y6gaTH9vYmjaorU6iZFt2Tonc';
const p2trAddress = 'bc1pzyq3zqg3qygszygpzyq3zqg3qygszygpzyq3zqg3qygszygp' +
  'zyqstwjakd';
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

// Encode an output value as a little endian 64 bit number
const tokensAsHex = tokens => {
  const value = Buffer.alloc(8);

  value.writeBigUInt64LE(BigInt(tokens));

  return value.toString('hex');
};

// The fee rate is 1.012 per vbyte, and the fee is rounded up
// The signed refund transactions only differ in their outputs
const makeRefund = ({script, tokens}) => [
  '01000000000101',
  'aa'.repeat(32),
  '01000000000000000001',
  tokensAsHex(tokens),
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
    args: makeArgs({transit_address: 'address'}),
    description: 'A valid transit address is required for a refund',
    error: [400, 'ExpectedValidTransitAddressToGetTransitRefund'],
  },
  {
    args: makeArgs({transaction_id: 'id'}),
    description: 'A valid transaction id is required for a refund',
    error: [400, 'ExpectedValidOutpointToGetTransitRefund'],
  },
  {
    args: makeArgs({funded_tokens: 400}),
    description: 'Funded tokens must cover the refund fee and dust',
    error: [400, 'ExpectedMoreFundedTokensToGetTransitRefund'],
  },
  {
    args: makeArgs({}),
    description: 'A refund to a bech32 address is signed',
    expected: {
      refund: makeRefund({
        script: '160014' + '07'.repeat(20),
        tokens: 99888,
      }),
    },
  },
  {
    args: makeArgs({refund_address: p2pkhAddress}),
    description: 'A refund to a p2pkh address is signed',
    expected: {
      refund: makeRefund({
        script: '1976a914' + '08'.repeat(20) + '88ac',
        tokens: 99885,
      }),
    },
  },
  {
    args: makeArgs({refund_address: p2shAddress}),
    description: 'A refund to a p2sh address is signed',
    expected: {
      refund: makeRefund({
        script: '17a914' + '09'.repeat(20) + '87',
        tokens: 99887,
      }),
    },
  },
  {
    // A P2TR output is 12 vbytes bigger than a P2WPKH output
    args: makeArgs({refund_address: p2trAddress}),
    description: 'A refund to a p2tr address pays for its larger size',
    expected: {
      refund: makeRefund({
        script: '225120' + '1101'.repeat(16),
        tokens: 99876,
      }),
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
