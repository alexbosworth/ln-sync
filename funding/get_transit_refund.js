const {address} = require('bitcoinjs-lib');
const asyncAuto = require('async/auto');
const {getChainFeeRate} = require('ln-service');
const {networks} = require('bitcoinjs-lib');
const {payments} = require('bitcoinjs-lib');
const {returnResult} = require('asyncjs-util');
const {signTransaction} = require('ln-service');
const {Transaction} = require('bitcoinjs-lib');

const bufferAsHex = buffer => buffer.toString('hex');
const {ceil} = Math;
const {concat} = Buffer;
const {fromBech32} = address;
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const idAsHash = id => Buffer.from(id, 'hex').reverse();
const {p2pkh} = payments;
const refundTxSize = 110;
const sigHashAll = Buffer.from([Transaction.SIGHASH_ALL]);
const targetSlow = 144;
const {toOutputScript} = address;
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
      // Accepted networks are ones known to BitcoinJS
      nets: cbk => {
        const nets = {
          btc: networks.bitcoin,
          btcregtest: networks.regtest,
          btctestnet: networks.testnet,
        };

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
      transactionToSign: ['getRate', 'nets', ({getRate, nets}, cbk) => {
        const fee = ceil(getRate.tokens_per_vbyte * refundTxSize);
        const network = nets[args.network];
        const outpointHash = idAsHash(args.transaction_id);
        const tx = new Transaction();

        // The refund pays the transit funds to the refund address, minus fee
        const refundOutput = toOutputScript(args.refund_address, network);

        tx.addInput(outpointHash, args.transaction_vout, Number());
        tx.addOutput(refundOutput, args.funded_tokens - fee);

        return cbk(null, tx);
      }],

      // Get the signature for the unsigned refund transaction
      getSignature: [
        'nets',
        'transactionToSign',
        ({nets, transactionToSign}, cbk) =>
      {
        const hash = fromBech32(args.transit_address).data;
        const network = nets[args.network];

        // The past output script is required for calculating the signature
        const outputScript = toOutputScript(args.transit_address, network);

        return signTransaction({
          lnd: args.lnd,
          inputs: [{
            key_family: transitKeyFamily,
            key_index: args.transit_key_index,
            output_script: bufferAsHex(outputScript),
            output_tokens: args.funded_tokens,
            sighash: Transaction.SIGHASH_ALL,
            vin: Number(),
            witness_script: bufferAsHex(p2pkh({hash}).output),
          }],
          transaction: transactionToSign.toHex(),
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

        const witnessStack = [
          concat([hexAsBuffer(signature), sigHashAll]),
          hexAsBuffer(args.transit_public_key),
        ];

        transactionToSign.setWitness(Number(), witnessStack);

        return cbk(null, {refund: transactionToSign.toHex()});
      }],
    },
    returnResult({reject, resolve, of: 'refundTransaction'}, cbk));
  });
};
