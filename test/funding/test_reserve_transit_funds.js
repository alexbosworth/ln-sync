const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');
const {createPsbt} = require('psbt');
const {hashForP2wpkh} = require('@alexbosworth/blockchain');
const {idForTransaction} = require('@alexbosworth/blockchain');
const {transactionFromComponents} = require('@alexbosworth/blockchain');

const {makeLnd} = require('mock-lnd');

const method = require('./../../funding/reserve_transit_funds');

const publicKey = '03e15819590382a9dd878f01e2f0cbce541564eb415e43b440472d883ecd283058';
const refundAddress = 'bc1qqurswpc8qurswpc8qurswpc8qurswpc89fe3yv';

const transitScript = '0014' + hashForP2wpkh({
  key: Buffer.from(publicKey, 'hex'),
}).hash.toString('hex');

const makeTransaction = ({script, tokens}) => transactionFromComponents({
  inputs: [{id: 'ab'.repeat(32), script: '', sequence: 0, vout: 0}],
  locktime: 0,
  outputs: [{script, tokens}],
  version: 1,
}).transaction;

// The funding transaction pays the requested tokens to the transit address
const fundTransaction = makeTransaction({
  script: transitScript,
  tokens: 1000000,
});

const fundId = idForTransaction({transaction: fundTransaction}).id;

// A transaction that does not pay to the transit address is not funding
const wrongScriptTx = makeTransaction({
  script: '0014' + '99'.repeat(20),
  tokens: 1000000,
});

// A transaction that pays an unexpected amount is not funding
const wrongAmountTx = makeTransaction({script: transitScript, tokens: 999});

// An unsigned PSBT has no extractable raw transaction
const unsignedPsbt = createPsbt({
  outputs: [{script: transitScript, tokens: 1000000}],
  utxos: [{id: 'ab'.repeat(32), sequence: 0, vout: 0}],
}).psbt;

const makeReserveLnd = ({chain}) => {
  const lnd = makeLnd({});

  // Exit early into a custom chain when the network should be overridden
  if (!!chain) {
    const info = {
      alias: '',
      best_header_timestamp: 1,
      block_hash: Buffer.alloc(32).toString('hex'),
      block_height: 1,
      chains: [chain],
      color: '#000000',
      features: {'1': {is_known: true, is_required: false}},
      identity_pubkey: '02' + '00'.repeat(32),
      num_active_channels: 0,
      num_peers: 0,
      num_pending_channels: 0,
      synced_to_chain: false,
      uris: [],
      version: '',
    };

    lnd.default.getInfo = ({}, cbk) => cbk(null, info);
  }

  lnd.default.newAddress = ({}, cbk) => cbk(null, {address: refundAddress});

  lnd.wallet.deriveKey = ({}, cbk) => cbk(null, {
    key_loc: {key_index: 3},
    raw_key_bytes: Buffer.from(publicKey, 'hex'),
  });

  lnd.wallet.deriveNextKey = lnd.wallet.deriveKey;

  lnd.signer = {
    signOutputRaw: (args, cbk) => cbk(null, {raw_sigs: [Buffer.alloc(71, 1)]}),
  };

  return lnd;
};

const makeArgs = overrides => {
  const args = {
    ask: (n, cbk) => cbk({fund: fundTransaction, rate: 1}),
    lnd: makeReserveLnd({}),
    logger: {info: () => {}},
    tokens: 1000000,
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const tests = [
  {
    args: makeArgs({ask: undefined}),
    description: 'An ask function is required to reserve transit funds',
    error: [400, 'ExpectedAskFunctionToReserveTransitFunds'],
  },
  {
    args: makeArgs({lnd: undefined}),
    description: 'An lnd object is required to reserve transit funds',
    error: [400, 'ExpectedAuthenticatedLndToReserveTransitFunds'],
  },
  {
    args: makeArgs({logger: undefined}),
    description: 'A logger is required to reserve transit funds',
    error: [400, 'ExpectedWinstonLoggerToReserveTransitFunds'],
  },
  {
    args: makeArgs({tokens: undefined}),
    description: 'A tokens count is required to reserve transit funds',
    error: [400, 'ExpectedTokensToReserveToReserveTransitFunds'],
  },
  {
    args: makeArgs({tokens: 1}),
    description: 'A tokens count above the minimum is required',
    error: [400, 'ExpectedLargerAdditionToReserveTransitFunds'],
  },
  {
    args: makeArgs({
      lnd: makeReserveLnd({chain: {chain: 'litecoin', network: 'mainnet'}}),
    }),
    description: 'A known network is required to reserve transit funds',
    error: [400, 'ExpectedKnownNetworkToReserveTransitFunds'],
  },
  {
    args: makeArgs({ask: (n, cbk) => cbk({fund: wrongScriptTx, rate: 1})}),
    description: 'Funding must pay to the transit output script',
    error: [400, 'ExpectedTransitTxOutputPayingToTransitAddress'],
  },
  {
    args: makeArgs({ask: (n, cbk) => cbk({fund: wrongAmountTx, rate: 5})}),
    description: 'Funding must pay the expected amount of tokens',
    error: [400, 'UnexpectedFundingAmountPayingToTransitAddress'],
  },
  {
    args: makeArgs({ask: (n, cbk) => cbk({fund: unsignedPsbt, rate: 1})}),
    description: 'Funding requires an extractable raw transaction',
    error: [400, 'ExpectedFundedTransactionToReserveTransitFunds'],
  },
  {
    args: makeArgs({}),
    description: 'Transit funds are reserved and a refund is created',
    expected: {
      address: 'bc1qcv905k9wqeemqzj9khqhml6xxduq79qqy745vn',
      id: fundId,
      index: 3,
      inputs: undefined,
      key: publicKey,
      output: transitScript,
      psbt: undefined,
      refund: [
        '01000000000101',
        'e7331fc032ab19974706d92081d21e08ba44f67e63178e66997f812d466994f7',
        '00000000000000000001d2410f0000000000160014',
        '07'.repeat(20),
        '0248',
        '01'.repeat(71),
        '0121',
        publicKey,
        '00000000',
      ].join(''),
      script: '76a914c30afa58ae0673b00a45b5c17dff4633780f140088ac',
      transaction: fundTransaction,
      vout: 0,
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
