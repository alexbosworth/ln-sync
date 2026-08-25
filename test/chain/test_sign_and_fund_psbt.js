const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');
const {createPsbt} = require('psbt');
const {extendPsbt} = require('psbt');
const {hashForP2wpkh} = require('@alexbosworth/blockchain');
const {idForTransaction} = require('@alexbosworth/blockchain');
const tinysecp = require('tiny-secp256k1');
const {transactionFromComponents} = require('@alexbosworth/blockchain');

const {makeLnd} = require('mock-lnd');

const method = require('./../../chain/sign_and_fund_psbt');

const conflictAddress = 'bc1qqurswpc8qurswpc8qurswpc8qurswpc89fe3yv';
const publicKey = '03e15819590382a9dd878f01e2f0cbce541564eb415e43b440472d883ecd283058';
const signature = '3044022074018ad4180097b873323c0015720b3684cc8123891048e7dbcd9b55ad679c99022073d369b740e3eb53dcefa33823c8070514ca55a7dd9544f157c167913261118c';

const keyHash = hashForP2wpkh({
  key: Buffer.from(publicKey, 'hex'),
}).hash.toString('hex');

const makePrevTx = ({id, script, tokens}) => transactionFromComponents({
  inputs: [{id, script: '', sequence: 0, vout: 0}],
  locktime: 0,
  outputs: [{script, tokens}],
  version: 1,
}).transaction;

// The previous transactions create the unspent outputs being spent
const prevTx1 = makePrevTx({
  id: 'aa'.repeat(32),
  script: '0014' + keyHash,
  tokens: 60000,
});

const prevTx3 = makePrevTx({
  id: 'bb'.repeat(32),
  script: '0014' + '66'.repeat(20),
  tokens: 40000,
});

const id1 = idForTransaction({transaction: prevTx1}).id;
const id2 = 'cd'.repeat(32);
const id3 = idForTransaction({transaction: prevTx3}).id;

const witnessUtxo1 = {script_pub: '0014' + keyHash, tokens: 60000};
const witnessUtxo2 = {script_pub: '5120' + '11'.repeat(32), tokens: 50000};
const witnessUtxo3 = {script_pub: '0014' + '66'.repeat(20), tokens: 40000};

// The base PSBT funds a channel output with three bare inputs
const base = createPsbt({
  outputs: [{script: '0020' + '77'.repeat(32), tokens: 100000}],
  utxos: [
    {id: id1, sequence: 0, vout: 0},
    {id: id2, sequence: 0, vout: 0},
    {id: id3, sequence: 0, vout: 0},
  ],
});

// The template psbt and final tx are used for max funding calculation
const template = createPsbt({
  outputs: [
    {script: '0014' + '33'.repeat(20), tokens: 546},
    {script: '0014' + '44'.repeat(20), tokens: 1000},
  ],
  utxos: [{id: id1, sequence: 0, vout: 0}],
});

// The finalized maximum transaction is also the conflict transaction
const finalTransaction = transactionFromComponents({
  inputs: [{id: id1, script: '', sequence: 0, vout: 0}],
  locktime: 0,
  outputs: [{script: '0014' + '33'.repeat(20), tokens: 48000}],
  version: 1,
}).transaction;

const utxos = [
  {
    bip32_derivations: [{
      fingerprint: '00000000',
      path: "m/0'/0/0",
      public_key: publicKey,
    }],
    non_witness_utxo: prevTx1,
    transaction_id: id1,
    transaction_vout: 0,
    witness_utxo: witnessUtxo1,
  },
  {
    bip32_derivations: [{
      fingerprint: '00000000',
      path: "m/0'/0/1",
      public_key: publicKey,
    }],
    transaction_id: id2,
    transaction_vout: 0,
    witness_utxo: witnessUtxo2,
  },
];

// Fixtures that require an ECPair library are made asynchronously
const setup = (async () => {
  const ecp = (await import('ecpair')).ECPairFactory(tinysecp);

  // The base funding PSBT has a non witness utxo set for the first input
  const basePsbt = extendPsbt({
    ecp,
    inputs: [{non_witness_utxo: prevTx1}, {}, {}],
    psbt: base.psbt,
  }).psbt;

  // A PSBT with an unexpected input attribute is invalid for funding
  const invalidAttributePsbt = extendPsbt({
    ecp,
    inputs: [{sighash_type: 1}, {}, {}],
    psbt: base.psbt,
  }).psbt;

  // The partially signed PSBT has a signature for every local input
  const signedResponse = extendPsbt({
    ecp,
    inputs: [
      {
        non_witness_utxo: prevTx1,
        partial_sig: [{signature, hash_type: 1, public_key: publicKey}],
        witness_utxo: witnessUtxo1,
      },
      {taproot_key_spend_sig: '22'.repeat(64), witness_utxo: witnessUtxo2},
      {non_witness_utxo: prevTx3, witness_utxo: witnessUtxo3},
    ],
    psbt: base.psbt,
  }).psbt;

  // A response with no signatures on any input is a signing failure
  const unsignedResponse = extendPsbt({
    ecp,
    inputs: [
      {witness_utxo: witnessUtxo1},
      {witness_utxo: witnessUtxo2},
      {witness_utxo: witnessUtxo3},
    ],
    psbt: base.psbt,
  }).psbt;

  return {basePsbt, invalidAttributePsbt, signedResponse, unsignedResponse};
})();

const makeSignLnd = ({response}) => {
  const lnd = makeLnd({
    fundPsbt: ({}, cbk) => cbk(null, {
      change_output_index: 1,
      funded_psbt: Buffer.from(template.psbt, 'hex'),
      locked_utxos: [{
        expiration: 1,
        id: Buffer.alloc(32),
        outpoint: {
          output_index: 0,
          txid_bytes: Buffer.from(id1, 'hex').reverse(),
        },
      }],
    }),
    signPsbt: ({}, cbk) => cbk(null, {
      raw_final_tx: Buffer.from(finalTransaction, 'hex'),
      signed_psbt: Buffer.from(template.psbt, 'hex'),
    }),
  });

  lnd.default.newAddress = ({}, cbk) => cbk(null, {address: conflictAddress});

  lnd.wallet.signPsbt = ({}, cbk) => {
    return cbk(null, {signed_psbt: Buffer.from(response, 'hex')});
  };

  return lnd;
};

// The expected result of signing and funding the base psbt
const makeExpected = () => ({
  conflict: finalTransaction,
  funding: '70736274ff0100b00200000003bd91d81b09ad25dae8814d5cee805d3e5ad8e0b1f15483fc5162303aaecbdaa7000000000000000000cdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd000000000000000000645194bd2bf4469330168e517b18a667ead72d5eeaed7729efa151f50843732500000000000000000001a0860100000000002200207777777777777777777777777777777777777777777777777777777777777777000000000001086502413044022074018ad4180097b873323c0015720b3684cc8123891048e7dbcd9b55ad679c99022073d369b740e3eb53dcefa33823c8070514ca55a7dd9544f157c1012103e15819590382a9dd878f01e2f0cbce541564eb415e43b440472d883ecd2830580100520100000001aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0000000000000000000160ea000000000000160014c30afa58ae0673b00a45b5c17dff4633780f14000000000001011f60ea000000000000160014c30afa58ae0673b00a45b5c17dff4633780f14000001084201402222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222201012b50c30000000000002251201111111111111111111111111111111111111111111111111111111111111111000108030101000100520100000001bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb00000000000000000001409c00000000000016001466666666666666666666666666666666666666660000000001011f409c00000000000016001466666666666666666666666666666666666666660000',
  psbt: '70736274ff0100b00200000003bd91d81b09ad25dae8814d5cee805d3e5ad8e0b1f15483fc5162303aaecbdaa7000000000000000000cdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd000000000000000000645194bd2bf4469330168e517b18a667ead72d5eeaed7729efa151f50843732500000000000000000001a086010000000000220020777777777777777777777777777777777777777777777777777777777777777700000000000100520100000001aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0000000000000000000160ea000000000000160014c30afa58ae0673b00a45b5c17dff4633780f140000000000220203e15819590382a9dd878f01e2f0cbce541564eb415e43b440472d883ecd28305848304502203044022074018ad4180097b873323c0015720b3684cc8123891048e7dbcd9b55022100ad679c99022073d369b740e3eb53dcefa33823c8070514ca55a7dd9544f157c10101011f60ea000000000000160014c30afa58ae0673b00a45b5c17dff4633780f1400000113402222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222201012b50c30000000000002251201111111111111111111111111111111111111111111111111111111111111111000100520100000001bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb00000000000000000001409c00000000000016001466666666666666666666666666666666666666660000000001011f409c00000000000016001466666666666666666666666666666666666666660000',
});

// A utxo set where the taproot input holds the most tokens
const taprootHeavyUtxos = utxos.map(utxo => {
  // Exit early when the utxo is not the taproot utxo
  if (utxo.witness_utxo !== witnessUtxo2) {
    return utxo;
  }

  return {
    bip32_derivations: utxo.bip32_derivations,
    transaction_id: utxo.transaction_id,
    transaction_vout: utxo.transaction_vout,
    witness_utxo: {script_pub: witnessUtxo2.script_pub, tokens: 70000},
  };
});

const tests = [
  {
    description: 'An lnd object is required to sign and fund a psbt',
    error: [400, 'ExpectedAuthenticatedLndToSignAndFundPsbt'],
    makeArgs: fixtures => ({psbt: fixtures.basePsbt, utxos}),
  },
  {
    description: 'A psbt is required to sign and fund a psbt',
    error: [400, 'ExpectedUnsignedPsbtToSignAndFundPsbt'],
    makeArgs: fixtures => ({
      lnd: makeSignLnd({response: fixtures.signedResponse}),
      utxos,
    }),
  },
  {
    description: 'An array of utxos is required to sign and fund a psbt',
    error: [400, 'ExpectedArrayOfUtxosToSignAndFundPsbt'],
    makeArgs: fixtures => ({
      lnd: makeSignLnd({response: fixtures.signedResponse}),
      psbt: fixtures.basePsbt,
    }),
  },
  {
    description: 'A valid psbt is required to sign and fund a psbt',
    error: [400, 'ExpectedValidPsbtToSignAndFundPsbt'],
    makeArgs: fixtures => ({
      lnd: makeSignLnd({response: fixtures.signedResponse}),
      psbt: '00',
      utxos,
    }),
  },
  {
    description: 'Known funding input attributes are required to fund',
    error: [400, 'UnexpectedInputElementAttributeInFundingPsbt'],
    makeArgs: fixtures => ({
      lnd: makeSignLnd({response: fixtures.signedResponse}),
      psbt: fixtures.invalidAttributePsbt,
      utxos,
    }),
  },
  {
    description: 'A signature on an input is required to fund',
    error: [503, 'UnexpectedFailureToPartiallySignBasePsbt'],
    makeArgs: fixtures => ({
      lnd: makeSignLnd({response: fixtures.unsignedResponse}),
      psbt: fixtures.basePsbt,
      utxos,
    }),
  },
  {
    description: 'A taproot conflict input psbt is signed and funded',
    expected: makeExpected(),
    makeArgs: fixtures => ({
      lnd: makeSignLnd({response: fixtures.signedResponse}),
      psbt: fixtures.basePsbt,
      utxos: taprootHeavyUtxos,
    }),
  },
  {
    description: 'A psbt is signed and funded with a conflict transaction',
    expected: makeExpected(),
    makeArgs: fixtures => ({
      lnd: makeSignLnd({response: fixtures.signedResponse}),
      psbt: fixtures.basePsbt,
      utxos,
    }),
  },
];

tests.forEach(({description, error, expected, makeArgs}) => {
  return test(description, async () => {
    const args = makeArgs(await setup);

    if (!!error) {
      await rejects(method(args), error, 'Got expected error');
    } else {
      const res = await method(args);

      deepEqual(res, expected, 'Got expected result');
    }

    return;
  });
});
