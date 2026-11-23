const asyncAuto = require('async/auto');
const asyncify = require('async/asyncify');
const {returnResult} = require('asyncjs-util');
const {createPsbt} = require('psbt');
const {extendPsbt} = require('psbt');
const {sizeOfTransaction} = require('@alexbosworth/blockchain');
const {transactionFromComponents} = require('@alexbosworth/blockchain');

const asTx = components => transactionFromComponents(components).transaction;
const {ceil} = Math;
const committed = (funds, m) => m.length === 2 ? funds / 2 : funds;
const defaultTxVersion = 1;
const dummyBytes = count => Buffer.alloc(count).toString('hex');
const dummyEcdsaSignature = dummyBytes(74);
const dummyPublicKey = dummyBytes(33);
const dummySchnorrSignature = dummyBytes(64);
const dustTokensPerVbyte = 3;
const emptyScriptSig = '';
const flatten = arr => [].concat(...arr);
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const {isArray} = Array;
const isP2tr = n => n.startsWith('5120') && n.length === 68;
const isP2wpkh = n => n.startsWith('0014') && n.length === 44;
const isWitnessLength = n => n.length >= 4 && n.length <= 42;
const isWitnessPush = n => n[1] + 2 === n.length;
const isWitnessVersion = n => !n || (n >= 0x51 && n <= 0x60);
const legacySpendVbytes = 32 + 4 + 1 + 107 + 4;
const notEmpty = arr => arr.filter(n => !!n);
const outputBaseVbytes = 8 + 1;
const pairSize = (fund, count) => (!fund ? 43 : 0) - (count === 2 ? 43/2 : 0);
const {random} = Math;
const sumOf = arr => arr.reduce((sum, n) => sum + n, 0);
const vsizeOf = tx => sizeOfTransaction({transaction: asTx(tx)}).vsize;
const witnessSpendVbytes = 32 + 4 + 1 + 26 + 4;

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
      outputs: ['validate', asyncify(({}) => {
        try {
          // Create a dummy tx to use for looking at vsize contributions
          const tx = {
            inputs: [],
            locktime: Number(),
            outputs: [],
            version: defaultTxVersion,
          };

          // A tx has some base wrapper vbytes to pay for
          const startSize = vsizeOf(tx);

          // Members should split the cost of the wrapper bytes
          const wrapperShare = ceil(startSize / proposed.length);

          const asOutput = script => ({script, tokens: capacity});

          const outputs = proposed.map(member => {
            const funded = sumOf(member.utxos.map(n => n.witness_utxo.tokens));
            const inputsOffset = tx.inputs.length;
            const outs = notEmpty(flatten([member.change, member.funding]));
            const pairFeeAddition = pairSize(member.funding, proposed.length);
            const tare = vsizeOf(tx);
            const totalOut = capacity * (member.funding || [capacity]).length;

            // Setup the individual member outputs
            outs.forEach(script => tx.outputs.push(asOutput(script)));

            // Setup the individual member inputs
            member.utxos.forEach(utxo => {
              return tx.inputs.push({
                id: utxo.transaction_id,
                script: emptyScriptSig,
                sequence: Number(),
                vout: utxo.transaction_vout,
              });
            });

            // Setup dummy signatures on the tx to calculate fee requirement
            member.utxos.forEach((utxo, i) => {
              // Set a dummy signature stack on the input
              if (isP2wpkh(utxo.witness_utxo.script_pub)) {
                const witness = [dummyPublicKey, dummyEcdsaSignature];

                return tx.inputs[i + inputsOffset].witness = witness;
              }

              if (isP2tr(utxo.witness_utxo.script_pub)) {
                const witness = [dummySchnorrSignature];

                return tx.inputs[i + inputsOffset].witness = witness;
              }

              throw new Error('UnsupportedOutputType');
            });

            // Calculate how much bigger the transaction got
            const vbytes = vsizeOf(tx) - tare + wrapperShare;

            // The fee is the added vbytes, modified for pair with split output
            const fee = ceil((vbytes * rate) + (pairFeeAddition * rate));

            // The change is the inputs total minus outputs total, minus fee
            const change = funded - committed(totalOut, proposed) - fee;

            // The inputs have to pay for the committed funds and the fee
            if (change < Number()) {
              throw new Error('ExpectedSufficientFundsInProposedUtxos');
            }

            const funding = (member.funding || []).map(n => asOutput(n));

            // Leftover funds go to the fee when there is no change output
            if (!member.change) {
              return funding;
            }

            const bytes = hexAsBuffer(member.change);

            const [version] = bytes;

            // Only witness programs get the discounted spend size
            const isWitness = isWitnessLength(bytes) &&
              isWitnessPush(bytes) &&
              isWitnessVersion(version);

            const spend = isWitness ? witnessSpendVbytes : legacySpendVbytes;

            const outputVbytes = outputBaseVbytes + bytes.length;

            // Dust is the cost of creating and spending change at 3/vbyte
            const dust = dustTokensPerVbyte * (outputVbytes + spend);

            // A change output below the dust value would not be relayed
            if (change < dust) {
              throw new Error('ExpectedChangeAboveDustInProposedUtxos');
            }

            return flatten([funding, {script: member.change, tokens: change}]);
          });

          // Collect outputs and shuffle them
          const finalOutputs = flatten(outputs).filter(n => !!n.script)
            .map(value => ({value, sort: random()}))
            .sort((a, b) => a.sort - b.sort)
            .map(({value}) => value);

          return finalOutputs;
        } catch (err) {
          throw [400, 'FailedToDeriveOutputsForPsbt', {err: err.message}];
        }
      })],

      // Assemble the funding for the unsigned PSBT
      funding: ['outputs', asyncify(({outputs}) => {
        try {
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
            inputs: utxos.map(utxo => ({
              non_witness_utxo: utxo.non_witness_utxo,
              witness_utxo: utxo.witness_utxo,
            })),
            psbt: fundingBase.psbt,
          });

          return {psbt: extended.psbt};
        } catch (err) {
          throw [400, 'FailedToAssembleUnsignedPsbt', {err: err.message}];
        }
      })],
    },
    returnResult({reject, resolve, of: 'funding'}, cbk));
  });
};
