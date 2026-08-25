const asyncAuto = require('async/auto');
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
const defaultLocktime = 0;
const defaultSequence = 0;
const defaultTxVersion = 1;
const emptyScriptSig = '';
const refundTxSize = 110;
const sigHashAll = 1;
const sigHashAllFlag = '01';
const targetSlow = 144;
const transitKeyFamily = 805;

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

      // Get the chain fee rate
      getRate: ['validate', ({}, cbk) => {
        return getChainFeeRate({
          confirmation_target: targetSlow,
          lnd: args.lnd,
        },
        cbk);
      }],

      // Create the transaction to sign
      transactionToSign: ['getRate', 'nets', ({getRate}, cbk) => {
        const fee = ceil(getRate.tokens_per_vbyte * refundTxSize);

        try {
          // The refund pays the transit funds to the refund address, minus fee
          const refundOutput = addressAsOutputScript({
            address: args.refund_address,
          });

          return cbk(null, {
            inputs: [{
              id: args.transaction_id,
              script: emptyScriptSig,
              sequence: defaultSequence,
              vout: args.transaction_vout,
            }],
            locktime: defaultLocktime,
            outputs: [{
              script: refundOutput.script,
              tokens: args.funded_tokens - fee,
            }],
            version: defaultTxVersion,
          });
        } catch (err) {
          return cbk([400, 'ExpectedValidRefundAddressToGetTransitRefund']);
        }
      }],

      // Get the signature for the unsigned refund transaction
      getSignature: [
        'nets',
        'transactionToSign',
        ({nets, transactionToSign}, cbk) =>
      {
        const {program} = decodeBech32Address({address: args.transit_address});

        // The past output script is required for calculating the signature
        const outputScript = p2wpkhOutputScript({hash: program}).script;

        // The witness script of a p2wpkh spend is the p2pkh output script
        const witnessScript = p2pkhOutputScript({hash: program}).script;

        // The unsigned transaction is the serialized tx components
        const {transaction} = transactionFromComponents(transactionToSign);

        return signTransaction({
          transaction,
          lnd: args.lnd,
          inputs: [{
            key_family: transitKeyFamily,
            key_index: args.transit_key_index,
            output_script: bufferAsHex(outputScript),
            output_tokens: args.funded_tokens,
            sighash: sigHashAll,
            vin: Number(),
            witness_script: bufferAsHex(witnessScript),
          }],
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
