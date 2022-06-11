const asyncAuto = require('async/auto');
const asyncEach = require('async/each');
const asyncMap = require('async/map');
const asyncReflect = require('async/reflect');
const {decodePsbt} = require('psbt');
const {fundPsbt} = require('ln-service');
const {lockUtxo} = require('ln-service');
const {returnResult} = require('asyncjs-util');
const tinysecp = require('tiny-secp256k1');
const {unlockUtxo} = require('ln-service');

const {isArray} = Array;

/** Fund a PSBT, disallowing specified inputs

  {
    disallow_inputs: [{
      transaction_id: <Do Not Use UTXO With Unspent Transaction Id Hex String>
      transaction_vout: <Do Not Use Unspent Transaction Output Index Number>
    }]
    [fee_tokens_per_vbyte]: <Chain Fee Tokens Per Virtual Byte Number>
    lnd: <Authenticated LND API Object>
    outputs: [{
      address: <Chain Address String>
      tokens: <Send Tokens Tokens Number>
    }]
  }

  @returns via cbk or Promise
  {
    inputs: [{
      bip32_derivations: [{
        fingerprint: <Public Key Fingerprint Hex String>
        [leaf_hashes]: <Taproot Leaf Hash Hex String>
        path: <BIP 32 Child / Hardened Child / Index Derivation Path String>
        public_key: <Public Key Hex String>
      }]
      lock_id: <UTXO Lock Id Hex String>
      [non_witness_utxo]: <Non-Witness Hex Encoded Transaction String>
      transaction_id: <Unspent Transaction Id Hex String>
      transaction_vout: <Unspent Transaction Output Index Number>
      witness_utxo: {
        script_pub: <UTXO ScriptPub Hex String>
        tokens: <Tokens Number>
      }
    }]
    outputs: [{
      is_change: <Spends To a Generated Change Output Bool>
      output_script: <Output Script Hex String>
      tokens: <Send Tokens Tokens Number>
    }]
    psbt: <Unsigned PSBT Hex String>
  }
*/
module.exports = (args, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Import ECPair library
      ecp: async () => (await import('ecpair')).ECPairFactory(tinysecp),

      // Check arguments
      validate: cbk => {
        if (!isArray(args.disallow_inputs)) {
          return cbk([400, 'ExpectedArrayOfInputsToDisallowToFundPsbt']);
        }

        if (!args.lnd) {
          return cbk([400, 'ExpectedAuthenticatedLndToFundPsbtWithoutInputs']);
        }

        if (!isArray(args.outputs)) {
          return cbk([400, 'ExpectedArrayOfOutputsToFundPsbtWithoutInputs']);
        }

        return cbk();
      },

      // Lock all the inputs that are disallowed
      lock: ['validate', ({}, cbk) => {
        return asyncMap(args.disallow_inputs, (input, cbk) => {
          return lockUtxo({
            lnd: args.lnd,
            transaction_id: input.transaction_id,
            transaction_vout: input.transaction_vout,
          },
          (err, res) => {
            if (!!err) {
              return cbk(err);
            }

            return cbk(null, {
              id: res.id,
              transaction_id: input.transaction_id,
              transaction_vout: input.transaction_vout,
            });
          });
        },
        cbk);
      }],

      // Attempt to fund the PSBT
      fundPsbt: ['lock', asyncReflect(({}, cbk) => {
        return fundPsbt({
          fee_tokens_per_vbyte: args.fee_tokens_per_vbyte,
          lnd: args.lnd,
          outputs: args.outputs,
        },
        cbk);
      })],

      // Unlock all the inputs that were locked for disallowing
      unlock: ['fundPsbt', 'lock', ({lock}, cbk) => {
        return asyncEach(lock, (locked, cbk) => {
          return unlockUtxo({
            id: locked.id,
            lnd: args.lnd,
            transaction_id: locked.transaction_id,
            transaction_vout: locked.transaction_vout,
          },
          cbk);
        },
        cbk);
      }],

      // Final funded PSBT
      funded: ['ecp', 'fundPsbt', 'unlock', ({ecp, fundPsbt}, cbk) => {
        if (!!fundPsbt.error) {
          return cbk(fundPsbt.error);
        }

        const {inputs} = decodePsbt({ecp, psbt: fundPsbt.value.psbt});

        return cbk(null, {
          inputs: fundPsbt.value.inputs.map((input, vin) => ({
            bip32_derivations: inputs[vin].bip32_derivations,
            lock_id: input.lock_id,
            non_witness_utxo: inputs[vin].non_witness_utxo,
            transaction_id: input.transaction_id,
            transaction_vout: input.transaction_vout,
            witness_utxo: inputs[vin].witness_utxo,
          })),
          outputs: fundPsbt.value.outputs,
          psbt: fundPsbt.value.psbt,
        });
      }],
    },
    returnResult({reject, resolve, of: 'funded'}, cbk));
  });
};
