const asyncAuto = require('async/auto');
const asyncify = require('async/asyncify');
const {decodeBech32Address} = require('@alexbosworth/blockchain');
const {getChainFeeRate} = require('ln-service');
const {p2pkhOutputScript} = require('@alexbosworth/blockchain');
const {p2wpkhOutputScript} = require('@alexbosworth/blockchain');
const {returnResult} = require('asyncjs-util');
const {signTransaction} = require('ln-service');
const {transactionFromComponents} = require('@alexbosworth/blockchain');

const addressAsOutputScript = require('./address_as_output_script');

const bufferAsHex = buffer => buffer.toString('hex');
const {ceil} = Math;
const byteLength = hex => hex.length / 2;
const defaultLocktime = 0;
const defaultSequence = 0;
const defaultTxVersion = 1;
const dustTokensPerVbyte = 3;
const emptyScriptSig = '';
const isWitnessScript = script => !/^(76)?a9/.test(script);
const legacySpendVbytes = 32 + 4 + 1 + 107 + 4;
const outputBaseVbytes = 8 + 1;
const p2wpkhScriptBytes = 22;
const refundTxSize = 110;
const sigHashAll = 1;
const sigHashAllFlag = '01';
const targetSlow = 144;
const transitKeyFamily = 805;
const witnessSpendVbytes = 32 + 4 + 1 + 26 + 4;

/** Make a refund transaction for transit funds

  {
    funded_tokens: <Tokens Sent to Transit Address Number>
    lnd: <Authenticated LND API Object>
    network: <Network Name String>
    refund_address: <Refund Coins to On Chain Address String>
    transit_address: <Transit On Chain Bech32 Address String>
    transit_key_index: <Transit Key Index Number>
    transit_public_key: <Transit Public Key Hex String>
    transaction_id: <Transaction Id Hex String>
    transaction_vout: <Transaction Output Index Number>
  }

  @returns via cbk or Promise
  {
    refund: <Fully Signed Refund Transaction Hex String>
  }
*/
module.exports = (args, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Accepted networks and their bech32 address prefixes
      nets: cbk => {
        const nets = {btc: 'bc', btcregtest: 'bcrt', btctestnet: 'tb'};

        return cbk(null, nets);
      },

      // Check arguments
      validate: ['nets', ({nets}, cbk) => {
        if (!args.funded_tokens) {
          return cbk([400, 'ExpectedFundedTokensCountToGetTransitRefund']);
        }

        if (!args.lnd) {
          return cbk([400, 'ExpectedAuthenticatedLndToGetTransitRefund']);
        }

        if (!nets[args.network]) {
          return cbk([400, 'ExpectedKnownNetworkNameToGetTransitRefund']);
        }

        if (!args.refund_address) {
          return cbk([400, 'ExpectedRefundAddressToGetTransitFundsRefund']);
        }

        if (!args.transit_address) {
          return cbk([400, 'ExpectedTransitAddressToGetTransitFundsRefund']);
        }

        if (args.transit_key_index === undefined) {
          return cbk([400, 'ExpectedTransitKeyIndexToGetTransitFundsRefund']);
        }

        if (!args.transit_public_key) {
          return cbk([400, 'ExpectedTransitPublicKeyToGetTransitFundsRefund']);
        }

        if (!args.transaction_id) {
          return cbk([400, 'ExpectedTransactionIdToGetTransitFundsRefund']);
        }

        if (args.transaction_vout === undefined) {
          return cbk([400, 'ExpectedTransactionVoutToGetTransitFundsRefund']);
        }

        return cbk();
      }],

      // Get the output script for the refund address
      refundOutput: ['validate', asyncify(({}) => {
        try {
          return addressAsOutputScript({address: args.refund_address});
        } catch (err) {
          throw [400, 'ExpectedValidRefundAddressToGetTransitRefund'];
        }
      })],

      // Get the chain fee rate
      getRate: ['validate', ({}, cbk) => {
        return getChainFeeRate({
          confirmation_target: targetSlow,
          lnd: args.lnd,
        },
        cbk);
      }],

      // Create the transaction to sign
      transactionToSign: [
        'getRate',
        'nets',
        'refundOutput',
        ({getRate, refundOutput}, cbk) =>
      {
        const {script} = refundOutput;

        // The refund size is for a P2WPKH output, other scripts change it
        const vbytes = refundTxSize + byteLength(script) - p2wpkhScriptBytes;

        const fee = ceil(getRate.tokens_per_vbyte * vbytes);
        const isWitness = isWitnessScript(script);

        const spendVbytes = isWitness ? witnessSpendVbytes : legacySpendVbytes;

        const outputVbytes = outputBaseVbytes + byteLength(script);

        // Dust is the cost of creating and spending the output at 3/vbyte
        const dust = dustTokensPerVbyte * (outputVbytes + spendVbytes);

        // Exit early when the fee doesn't leave enough to relay a refund
        if (args.funded_tokens - fee < dust) {
          return cbk([400, 'ExpectedMoreFundedTokensToGetTransitRefund']);
        }

        // The refund pays the transit funds to the refund address, minus fee
        return cbk(null, {
          inputs: [{
            id: args.transaction_id,
            script: emptyScriptSig,
            sequence: defaultSequence,
            vout: args.transaction_vout,
          }],
          locktime: defaultLocktime,
          outputs: [{
            script,
            tokens: args.funded_tokens - fee,
          }],
          version: defaultTxVersion,
        });
      }],

      // Derive the scripts that are needed to sign a spend of transit funds
      transit: ['validate', asyncify(({}) => {
        try {
          const address = args.transit_address;

          const {program} = decodeBech32Address({address});

          return {
            // The past output script is required for calculating the signature
            output: bufferAsHex(p2wpkhOutputScript({hash: program}).script),
            // The witness script of a p2wpkh spend is the p2pkh output script
            witness: bufferAsHex(p2pkhOutputScript({hash: program}).script),
          };
        } catch (err) {
          throw [400, 'ExpectedValidTransitAddressToGetTransitRefund'];
        }
      })],

      // The unsigned transaction is the serialized tx components
      unsigned: ['transactionToSign', asyncify(({transactionToSign}) => {
        try {
          return transactionFromComponents(transactionToSign);
        } catch (err) {
          throw [400, 'ExpectedValidOutpointToGetTransitRefund'];
        }
      })],

      // Get the signature for the unsigned refund transaction
      getSignature: ['transit', 'unsigned', ({transit, unsigned}, cbk) => {
        return signTransaction({
          lnd: args.lnd,
          inputs: [{
            key_family: transitKeyFamily,
            key_index: args.transit_key_index,
            output_script: transit.output,
            output_tokens: args.funded_tokens,
            sighash: sigHashAll,
            vin: Number(),
            witness_script: transit.witness,
          }],
          transaction: unsigned.transaction,
        },
        cbk);
      }],

      // Use the signature to construct the fully signed refund transaction
      refundTransaction: [
        'getSignature',
        'transactionToSign',
        ({getSignature, transactionToSign}, cbk) =>
      {
        const [signature] = getSignature.signatures;

        const witness = [signature + sigHashAllFlag, args.transit_public_key];

        const [input] = transactionToSign.inputs;

        // Attach the witness stack to the transaction input
        const {transaction} = transactionFromComponents({
          inputs: [{
            witness,
            id: input.id,
            script: input.script,
            sequence: input.sequence,
            vout: input.vout,
          }],
          locktime: transactionToSign.locktime,
          outputs: transactionToSign.outputs,
          version: transactionToSign.version,
        });

        return cbk(null, {refund: transaction});
      }],
    },
    returnResult({reject, resolve, of: 'refundTransaction'}, cbk));
  });
};
