const {address} = require('bitcoinjs-lib');
const asyncAuto = require('async/auto');
const {createChainAddress} = require('ln-service');
const {createPsbt} = require('psbt');
const {decodePsbt} = require('psbt');
const {extendPsbt} = require('psbt');
const {getChainFeeRate} = require('ln-service');
const {getHeight} = require('ln-service');
const {partiallySignPsbt} = require('ln-service');
const {payments} = require('bitcoinjs-lib');
const {returnResult} = require('asyncjs-util');
const {signPsbt} = require('ln-service');
const tinysecp = require('tiny-secp256k1');
const {Transaction} = require('bitcoinjs-lib');
const {unextractTransaction} = require('psbt');

const getMaxFundAmount = require('./get_max_fund_amount');

const allowedAttributes = ['non_witness_utxo', 'witness_utxo'];
const bufferAsHex = buffer => buffer.toString('hex');
const {concat} = Buffer;
const defaultBlocksBuffer = 18;
const dummySignature = Buffer.alloc(1);
const format = 'p2wpkh';
const {from} = Buffer;
const {fromBech32} = address;
const {fromHex} = Transaction;
const hashAll = Transaction.SIGHASH_ALL;
const hashDefault = Transaction.SIGHASH_DEFAULT;
const hexAsBuf = hex => Buffer.from(hex, 'hex');
const inputAsOutpoint = n => `${n.transaction_id}:${n.transaction_vout}`;
const {isArray} = Array;
const {keys} = Object;
const minSequence = 0;
const notEmpty = arr => arr.filter(n => !!n);
const {p2wpkh} = payments;
const slowConf = 144;
const spendAsOutpoint = n => `${n.hash.reverse().toString('hex')}:${n.index}`;

/** Partially sign and fund a PSBT and create a conflicting transaction

  Only P2TR and P2WPKH inputs are supported

  To allow for funding a channel, a dummy "finalized" PSBT is returned

  {
    lnd: <Authenticated Signing LND API Object>
    psbt: <Base Funding With Bare Inputs PSBT Hex String>
    utxos: [{
      bip32_derivations: [{
        fingerprint: <Public Key Fingerprint Hex String>
        [leaf_hashes]: <Taproot Leaf Hash Hex String>
        path: <BIP 32 Child / Hardened Child / Index Derivation Path String>
        public_key: <Public Key Hex String>
      }]
      [non_witness_utxo]: <UTXO Spending Transaction Hex String>
      transaction_id: <Unspent Transaction Id Hex String>
      transaction_vout: <Unspent Transaction Output Index Number>
      witness_utxo: {
        script_pub: <UTXO Output Script Hex String>
        tokens: <UTXO Tokens Value Number>
      }
    }]
  }

  @returns via cbk or Promise
  {
    conflict: <Conflict Transaction Hex String>
    funding: <Funding Dummy PSBT Hex String>
    psbt: <Partially Signed PSBT Hex String>
  }
*/
module.exports = ({lnd, psbt, utxos}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Import ECPair library
      ecp: async () => (await import('ecpair')).ECPairFactory(tinysecp),

      // Check arguments
      validate: cbk => {
        if (!lnd) {
          return cbk([400, 'ExpectedAuthenticatedLndToSignAndFundPsbt']);
        }

        if (!psbt) {
          return cbk([400, 'ExpectedUnsignedPsbtToSignAndFundPsbt']);
        }

        if (!isArray(utxos)) {
          return cbk([400, 'ExpectedArrayOfUtxosToSignAndFundPsbt']);
        }

        return cbk();
      },

      // Determine which UTXO to use for the conflicting transaction
      conflictingInput: ['validate', ({}, cbk) => {
        // Get the highest value UTXO for the conflicting tx
        const [input] = utxos.slice().sort((a, b) => {
          return b.witness_utxo.tokens - a.witness_utxo.tokens;
        });

        return cbk(null, input);
      }],

      // Create a conflicting address to refund funds to invalidate signature
      createConflictAddress: ['validate', ({}, cbk) => {
        return createChainAddress({format, lnd}, cbk);
      }],

      // Get the current block height to use in conflict transaction nlocktime
      getHeight: ['validate', ({}, cbk) => getHeight({lnd}, cbk)],

      // Get a conflicting chain fee rate to use for the conflict transaction
      getRate: ['validate', ({}, cbk) => {
        return getChainFeeRate({lnd, confirmation_target: slowConf}, cbk);
      }],

      // Decode the base PSBT to get the unsigned funding transaction
      funding: ['ecp', 'validate', ({ecp}, cbk) => {
        try {
          return cbk(null, decodePsbt({ecp, psbt}));
        } catch (err) {
          return cbk([400, 'ExpectedValidPsbtToSignAndFundPsbt', {err}]);
        }
      }],

      // Extend the PSBT with the derivation paths
      psbtToSign: ['ecp', 'funding', ({ecp, funding}, cbk) => {
        const tx = fromHex(funding.unsigned_transaction);

        // Look to see if there is an input with an unexpected attribute
        const invalidInput = funding.inputs.find(input => {
          return keys(input).find(key => !allowedAttributes.includes(key));
        });

        if (!!invalidInput) {
          return cbk([
            400,
            'UnexpectedInputElementAttributeInFundingPsbt',
            {input: invalidInput},
          ]);
        }

        // Populate the inputs with signing instructions
        const inputs = funding.inputs.map((input, vin) => {
          const outpoint = spendAsOutpoint(tx.ins[vin]);

          // Look for relevant signing instructions
          const utxo = utxos.find(n => inputAsOutpoint(n) === outpoint) || {};

          return {
            bip32_derivations: utxo.bip32_derivations,
            non_witness_utxo: input.non_witness_utxo,
            sighash_type: !!input.non_witness_utxo ? hashAll : hashDefault,
            witness_utxo: input.witness_utxo,
          };
        });

        // Extend the base PSBT with relevant signing information
        return cbk(null, {psbt: extendPsbt({ecp, inputs, psbt}).psbt});
      }],

      // Find the conflicting amount to send to the refund address
      getConflictAmount: [
        'conflictingInput',
        'createConflictAddress',
        'getRate',
        ({conflictingInput, createConflictAddress, getRate}, cbk) =>
      {
        return getMaxFundAmount({
          lnd,
          addresses: [createConflictAddress.address],
          fee_tokens_per_vbyte: getRate.tokens_per_vbyte,
          inputs: [{
            tokens: conflictingInput.witness_utxo.tokens,
            transaction_id: conflictingInput.transaction_id,
            transaction_vout: conflictingInput.transaction_vout,
          }],
        },
        cbk);
      }],

      // Create a conflicting transaction to sign to invalidate the main PSBT
      conflict: [
        'conflictingInput',
        'createConflictAddress',
        'ecp',
        'getConflictAmount',
        'getHeight',
        ({
          conflictingInput,
          createConflictAddress,
          ecp,
          getConflictAmount,
          getHeight,
        },
        cbk) =>
      {
        const hash = fromBech32(createConflictAddress.address).data;

        // Make the base conflict PSBT sending the max amount to a P2TR address
        const {psbt} = createPsbt({
          outputs: [{
            script: bufferAsHex(p2wpkh({hash}).output),
            tokens: getConflictAmount.max_tokens,
          }],
          timelock: getHeight.current_block_height + defaultBlocksBuffer,
          utxos: [{
            id: conflictingInput.transaction_id,
            sequence: minSequence,
            vout: conflictingInput.transaction_vout,
          }],
        });

        const base = decodePsbt({ecp, psbt});

        const tx = fromHex(base.unsigned_transaction);

        // Pull the derivation paths into the PSBT to inform signing
        const inputs = base.inputs.map((input, vin) => {
          const outpoint = spendAsOutpoint(tx.ins[vin]);

          // Look for relevant signing instructions
          const utxo = utxos.find(n => inputAsOutpoint(n) === outpoint) || {};

          return {
            bip32_derivations: utxo.bip32_derivations,
            non_witness_utxo: utxo.non_witness_utxo,
            sighash_type: !!utxo.non_witness_utxo ? hashAll : hashDefault,
            witness_utxo: utxo.witness_utxo,
          };
        });

        // Extend the base PSBT with relevant signing information
        return cbk(null, extendPsbt({ecp, inputs, psbt}).psbt);
      }],

      // Sign and finalize the conflicting PSBT to get the conflict transaction
      signConflict: ['conflict', ({conflict}, cbk) => {
        return signPsbt({lnd, psbt: conflict}, cbk);
      }],

      // Partially sign the base PSBT
      signPsbt: ['psbtToSign', ({psbtToSign}, cbk) => {
        return partiallySignPsbt({lnd, psbt: psbtToSign.psbt}, cbk);
      }],

      // Set the final signature into the base PSBT
      finalize: ['ecp', 'signPsbt', ({ecp, signPsbt}, cbk) => {
        const signatures = decodePsbt({ecp, psbt: signPsbt.psbt});

        // Select the transaction inputs that have a signature
        const inputsWithSignatures = signatures.inputs.filter(input => {
          return !!input.partial_sig || !!input.taproot_key_spend_sig;
        });

        // Exit early with error when there are no signatures
        if (!inputsWithSignatures.length) {
          return cbk([503, 'UnexpectedFailureToPartiallySignBasePsbt']);
        }

        // Create a template transaction to use for the finalized PSBT
        const tx = fromHex(signatures.unsigned_transaction);

        const finalized = signatures.inputs.map((input, vin) => {
          // Exit early when there is no local signature present
          if (!input.partial_sig && !input.taproot_key_spend_sig) {
            return tx.setWitness(vin, [dummySignature]);
          }

          // Exit early when setting the signature for v1 Taproot
          if (!!input.taproot_key_spend_sig) {
            return tx.setWitness(vin, [hexAsBuf(input.taproot_key_spend_sig)]);
          }

          // Set the public key and signature for v0 SegWit
          const [partial] = input.partial_sig;

          return tx.setWitness(vin, [
            concat([hexAsBuf(partial.signature), from([hashAll])]),
            hexAsBuf(partial.public_key),
          ]);
        });

        // Convert the transaction into a finalized PSBT
        const fundingPsbt = unextractTransaction({
          ecp,
          transaction: tx.toHex(),
          spending: notEmpty(signatures.inputs.map(n => n.non_witness_utxo)),
          utxos: notEmpty(signatures.inputs.map((input, vin) => {
            return {
              vin,
              script_pub: input.witness_utxo.script_pub,
              tokens: input.witness_utxo.tokens,
            };
          })),
        });

        return cbk(null, {psbt: fundingPsbt.psbt});
      }],

      // Final funded transactions resolution
      result: [
        'ecp',
        'finalize',
        'signConflict',
        'signPsbt',
        ({ecp, finalize, signConflict, signPsbt}, cbk) =>
      {
        const signed = decodePsbt({ecp, psbt: signPsbt.psbt});

        // Add the resulting signatures into the base PSBT so that it's signed
        const extended = extendPsbt({
          ecp,
          psbt,
          inputs: signed.inputs.map(input => {
            return {
              non_witness_utxo: input.non_witness_utxo,
              partial_sig: input.partial_sig,
              taproot_key_spend_sig: input.taproot_key_spend_sig,
              witness_utxo: input.witness_utxo,
            };
          }),
        });

        return cbk(null, {
          conflict: signConflict.transaction,
          funding: finalize.psbt,
          psbt: extended.psbt,
        });
      }],
    },
    returnResult({reject, resolve, of: 'result'}, cbk));
  });
};
