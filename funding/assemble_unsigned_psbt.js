const asyncAuto = require('async/auto');
const {returnResult} = require('asyncjs-util');
const {createPsbt} = require('psbt');
const {extendPsbt} = require('psbt');
const tinysecp = require('tiny-secp256k1');
const {Transaction} = require('bitcoinjs-lib');

const {ceil} = Math;
const committed = (funds, m) => m.length === 2 ? funds / 2 : funds;
const dummyEcdsaSignature = Buffer.alloc(74);
const dummyPublicKey = Buffer.alloc(33);
const dummySchnorrSignature = Buffer.alloc(64);
const flatten = arr => [].concat(...arr);
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const {isArray} = Array;
const isP2tr = n => n.startsWith('5120') && n.length === 68;
const isP2wpkh = n => n.startsWith('0014') && n.length === 44;
const notEmpty = arr => arr.filter(n => !!n);
const pairSize = (fund, count) => (!fund ? 43 : 0) - (count === 2 ? 43/2 : 0);
const {random} = Math;
const sumOf = arr => arr.reduce((sum, n) => sum + n, 0);

/** Assemble an unsigned PSBT with funding from multiple parties

  {
    capacity: <Channel Capacity Tokens Number>
    proposed: [{
      [change]: <Change Output Hex String>
      [funding]: [<Funding Output Hex String>]
      utxos: [{
        [non_witness_utxo]: <Spending Transaction Hex String>
        transaction_id: <Transaction Id Hex String>
        transaction_vout: <Transaction Output Index Number>
        witness_utxo: {
          script_pub: <Witness Output Script Hex String>
          tokens: <Tokens Number>
        }
      }]
    }]
    rate: <Fee Rate Number>
  }

  @returns via cbk or Promise
  {
    psbt: <Unsigned Funding Transaction PSBT Hex String>
  }
*/
module.exports = ({capacity, proposed, rate}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Import ECPair library
      ecp: async () => (await import('ecpair')).ECPairFactory(tinysecp),

      // Check arguments
      validate: cbk => {
        if (!capacity) {
          return cbk([400, 'ExpectedCapacityToAssembleUnsignedPsbt']);
        }

        if (!isArray(proposed)) {
          return cbk([400, 'ExpectedChannelProposalsToAssembleUnsignedPsbt']);
        }

        if (!rate) {
          return cbk([400, 'ExpectedChainFeeRateToAssembleUnsignedPsbt']);
        }

        return cbk();
      },

      // Derive funding transaction outputs
      outputs: ['validate', ({}, cbk) => {
        // Create a dummy tx to use for looking at vsize contributions
        const tx = new Transaction();

        // A tx has some base wrapper vbytes to pay for
        const startSize = tx.virtualSize();

        // Members should split the cost of the wrapper bytes
        const wrapperShare = ceil(startSize / proposed.length);

        const outputs = proposed.map(member => {
          const funded = sumOf(member.utxos.map(n => n.witness_utxo.tokens));
          const inputsOffset = tx.ins.length;
          const outs = notEmpty(flatten([member.change, member.funding]));
          const pairFeeAddition = pairSize(member.funding, proposed.length);
          const tare = tx.virtualSize();
          const totalOut = capacity * (member.funding || [capacity]).length;

          // Setup the individual member outputs
          outs.forEach(out => tx.addOutput(hexAsBuffer(out), capacity));

          // Setup the individual member inputs
          member.utxos.forEach(utxo => {
            return tx.addInput(
              hexAsBuffer(utxo.transaction_id),
              utxo.transaction_vout
            );
          });

          // Setup dummy signatures on the tx to calculate fee requirement
          member.utxos.forEach((utxo, i) => {
            // Set a dummy signature stack on the input
            if (isP2wpkh(utxo.witness_utxo.script_pub)) {
              return tx.setWitness(
                i + inputsOffset,
                [dummyPublicKey, dummyEcdsaSignature]
              );
            }

            if (isP2tr(utxo.witness_utxo.script_pub)) {
              return tx.setWitness(i + inputsOffset, [dummySchnorrSignature]);
            }

            throw new Error('UnsupportedOutputType');
          });

          // Calculate how much bigger the transaction got
          const vbytes = tx.virtualSize() - tare + wrapperShare;

          // The fee is this added vbytes, modified for pair with split output
          const fee = ceil((vbytes * rate) + (pairFeeAddition * rate));

          // The change is the inputs total minus the outputs total, minus fee
          return flatten([
            (member.funding || []).map(script => ({script, tokens: capacity})),
            {
              script: member.change,
              tokens: funded - committed(totalOut, proposed) - fee,
            },
          ]);
        });

        // Collect outputs and shuffle them
        const finalOutputs = flatten(outputs).filter(n => !!n.script)
          .map(value => ({value, sort: random()}))
          .sort((a, b) => a.sort - b.sort)
          .map(({value}) => value);

        return cbk(null, finalOutputs);
      }],

      // Assemble the funding for the unsigned PSBT
      funding: ['ecp', 'outputs', ({ecp, outputs}, cbk) => {
        // Put together all inputs funding the transaction, shuffle inputs
        const utxos = flatten(proposed.map(n => n.utxos))
          .map(utxo => ({
            id: utxo.transaction_id,
            non_witness_utxo: utxo.non_witness_utxo,
            sequence: Number(),
            vout: utxo.transaction_vout,
            witness_utxo: utxo.witness_utxo,
          }))
          .map(value => ({value, sort: random()}))
          .sort((a, b) => a.sort - b.sort)
          .map(({value}) => value);

        // Setup a baseline PSBT with the inputs and outputs
        const fundingBase = createPsbt({outputs, utxos});

        // Extend the base PSBT with the UTXO metadata
        const extended = extendPsbt({
          ecp,
          inputs: utxos.map(utxo => ({
            non_witness_utxo: utxo.non_witness_utxo,
            witness_utxo: utxo.witness_utxo,
          })),
          psbt: fundingBase.psbt,
        });

        return cbk(null, {psbt: extended.psbt});
      }],
    },
    returnResult({reject, resolve, of: 'funding'}, cbk));
  });
};
