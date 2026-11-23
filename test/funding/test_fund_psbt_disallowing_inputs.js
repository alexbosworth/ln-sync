const {deepEqual} = require('node:assert').strict;
const {makeLnd} = require('mock-lnd');
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const method = require('./../../funding/fund_psbt_disallowing_inputs');

const asOutpoint = n => `${n.txid_str}:${n.output_index}`;

// Lease outputs like LND does, a leased output can't be leased again
const makeFundingLnd = ({fundPsbt, lockErr, lockErrVout}) => {
  const leases = {};
  const lnd = makeLnd({fundPsbt});

  lnd.wallet.leaseOutput = ({id, outpoint}, cbk) => {
    const isFailing = [undefined, outpoint.output_index].includes(lockErrVout);

    // Exit early when locking the UTXO should fail
    if (!!lockErr && isFailing) {
      return cbk(lockErr);
    }

    // Exit early when the UTXO was not released by its past locker
    if (!!leases[asOutpoint(outpoint)]) {
      return cbk({details: 'output already locked'});
    }

    leases[asOutpoint(outpoint)] = id.toString('hex');

    return cbk(null, {expiration: '1'});
  };

  lnd.wallet.releaseOutput = ({id, outpoint}, cbk) => {
    // Exit early when the lease is not held with this id
    if (leases[asOutpoint(outpoint)] !== id.toString('hex')) {
      return cbk({details: 'output is not locked with this id'});
    }

    delete leases[asOutpoint(outpoint)];

    return cbk();
  };

  return lnd;
};

// A wallet where the output at index 1 can not be locked
const partialLockLnd = makeFundingLnd({lockErr: 'err', lockErrVout: 1});

const makeArgs = overrides => {
  const args = {
    lnd: makeFundingLnd({}),
    disallow_inputs: [{
      transaction_id: Buffer.alloc(32).toString('hex'),
      transaction_vout: 0,
    }],
    outputs: [{address: 'address', tokens: 1}],
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

// The funding from the wallet
const funded = {
  inputs: [
    {
      bip32_derivations: undefined,
      lock_id: Buffer.alloc(32).toString('hex'),
      non_witness_utxo: undefined,
      transaction_id: '75ddabb27b8845f5247975c8a5ba7c6f336c4570708ebe230caf6db5217ae858',
      transaction_vout: 0,
      witness_utxo: undefined,
    },
    {
      bip32_derivations: undefined,
      lock_id: undefined,
      non_witness_utxo: undefined,
      transaction_id: '1dea7cd05979072a3578cab271c02244ea8a090bbb46aa680a65ecd027048d83',
      transaction_vout: 1,
      witness_utxo: undefined,
    },
  ],
  outputs: [
    {
      is_change: true,
      output_script: '0014d85c2b71d0060b09c9886aeb815e50991dda124d',
      tokens: 149990000,
    },
    {
      is_change: false,
      output_script: '001400aea9a2e5f0f876a588df5546e8742d1d87008f',
      tokens: 100000000,
    },
  ],
  psbt: '70736274ff01009a020000000258e87a21b56daf0c23be8e7070456c336f7cbaa5c8757924f545887bb2abdd750000000000ffffffff838d0427d0ec650a68aa46bb0b098aea4422c071b2ca78352a077959d07cea1d0100000000ffffffff0270aaf00800000000160014d85c2b71d0060b09c9886aeb815e50991dda124d00e1f5050000000016001400aea9a2e5f0f876a588df5546e8742d1d87008f000000000000000000',
};

const tests = [
  {
    args: makeArgs({disallow_inputs: undefined}),
    description: 'An array of inputs to disallow is required',
    error: [400, 'ExpectedArrayOfInputsToDisallowToFundPsbt'],
  },
  {
    args: makeArgs({lnd: undefined}),
    description: 'An lnd object is required to fund a PSBT',
    error: [400, 'ExpectedAuthenticatedLndToFundPsbtWithoutInputs'],
  },
  {
    args: makeArgs({outputs: undefined}),
    description: 'An array of outputs is required to fund a PSBT',
    error: [400, 'ExpectedArrayOfOutputsToFundPsbtWithoutInputs'],
  },
  {
    args: makeArgs({lnd: makeFundingLnd({lockErr: 'err'})}),
    description: 'A failure to lock a disallowed input returns an error',
    error: [503, 'UnexpectedErrorLockingUtxo', {err: 'err'}],
  },
  {
    args: makeArgs({
      disallow_inputs: [0, 1].map(vout => ({
        transaction_id: Buffer.alloc(32).toString('hex'),
        transaction_vout: vout,
      })),
      lnd: partialLockLnd,
    }),
    description: 'A failure to lock one of the inputs returns an error',
    error: [503, 'UnexpectedErrorLockingUtxo', {err: 'err'}],
  },
  {
    // The same wallet as the failed locking: a leftover lock fails this
    args: makeArgs({lnd: partialLockLnd}),
    description: 'Inputs locked before a failure to lock are released',
    expected: funded,
  },
  {
    args: makeArgs({
      lnd: makeFundingLnd({fundPsbt: ({}, cbk) => cbk('err')}),
    }),
    description: 'A failure to fund the PSBT returns an error',
    error: [503, 'UnexpectedErrorFundingTransaction', {err: 'err'}],
  },
  {
    args: makeArgs({}),
    description: 'A PSBT is funded without the disallowed inputs',
    expected: funded,
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    if (!!error) {
      await rejects(method(args), error, 'Got expected error');
    } else {
      deepEqual(await method(args), expected, 'Got expected result');
    }

    return;
  });
});
