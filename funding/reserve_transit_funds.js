const asyncAuto = require('async/auto');
const {createChainAddress} = require('ln-service');
const {getPublicKey} = require('ln-service');
const {networks} = require('bitcoinjs-lib');
const {payments} = require('bitcoinjs-lib');
const {returnResult} = require('asyncjs-util');
const {Transaction} = require('bitcoinjs-lib');

const getFundedTransaction = require('./get_funded_transaction');
const {getNetwork} = require('./../chain');
const getTransitRefund = require('./get_transit_refund');

const familyTemporary = 805;
const {fromHex} = Transaction;
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const minimum = 294;
const {p2wpkh} = payments;

/** Get on-chain funding and a refund

  {
    ask: <Ask Function>
    lnd: <Authenticated LND API Object>
    logger: <Winston Logger Object>
    tokens: <Fund Tokens Number>
  }

  @returns via cbk or Promise
  {
    id: <Transaction Id Hex String>
    index: <Transit Public Key Index Number>
    [inputs]: [{
      [lock_expires_at]: <UTXO Lock Expires At ISO 8601 Date String>
      [lock_id]: <UTXO Lock Id Hex String>
      transaction_id: <Transaction Hex Id String>
      transaction_vout: <Transaction Output Index Number>
    }]
    [psbt]: <Transaction As Finalized PSBT Hex String>
    refund: <Refund Transaction Hex String>
    transaction: <Raw Transaction Hex String>
    vout: <Funds Reserved At Output Index Number>
  }
*/
module.exports = ({ask, lnd, logger, tokens}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!ask) {
          return cbk([400, 'ExpectedAskFunctionToReserveTransitFunds']);
        }

        if (!lnd) {
          return cbk([400, 'ExpectedAuthenticatedLndToReserveTransitFunds']);
        }

        if (!logger) {
          return cbk([400, 'ExpectedWinstonLoggerToReserveTransitFunds']);
        }

        if (!tokens) {
          return cbk([400, 'ExpectedTokensToReserveToReserveTransitFunds']);
        }

        if (tokens < minimum) {
          return cbk([400, 'ExpectedLargerAdditionToReserveTransitFunds']);
        }

        return cbk();
      },

      // Get the network name
      getNetwork: ['validate', ({}, cbk) => getNetwork({lnd}, cbk)],

      // Setup a new transit key for capacity increase
      getTransitKey: ['getNetwork', ({getNetwork}, cbk) => {
        if (!getNetwork.bitcoinjs) {
          return cbk([400, 'ExpectedKnownNetworkToReserveTransitFunds']);
        }

        return getPublicKey({lnd, family: familyTemporary}, cbk);
      }],

      // Create a refund address
      createRefund: ['getTransitKey', ({}, cbk) => {
        return createChainAddress({lnd}, cbk);
      }],

      // Derive a transit address from the transit key
      transit: [
        'getNetwork',
        'getTransitKey',
        ({getNetwork, getTransitKey}, cbk) =>
      {
        return cbk(null, p2wpkh({
          network: networks[getNetwork.bitcoinjs],
          pubkey: hexAsBuffer(getTransitKey.public_key),
        }));
      }],

      // Get funding to the transit key
      getFunding: ['transit', ({transit}, cbk) => {
        return getFundedTransaction({
          ask,
          lnd,
          logger,
          outputs: [{tokens, address: transit.address}],
        },
        cbk);
      }],

      // Funding transaction output index
      transactionVout: [
        'getFunding',
        'transit',
        ({getFunding, transit}, cbk) =>
      {
        const vout = fromHex(getFunding.transaction).outs.findIndex(output => {
          return output.script.equals(transit.output);
        });

        return cbk(null, vout);
      }],

      // Get a refund transaction for the transit funds
      getRefund: [
        'createRefund',
        'getFunding',
        'getNetwork',
        'getTransitKey',
        'transit',
        'transactionVout',
        ({
          createRefund,
          getFunding,
          getNetwork,
          getTransitKey,
          transit,
          transactionVout,
        },
        cbk) =>
      {
        return getTransitRefund({
          lnd,
          funded_tokens: tokens,
          network: getNetwork.network,
          refund_address: createRefund.address,
          transit_address: transit.address,
          transit_key_index: getTransitKey.index,
          transit_public_key: getTransitKey.public_key,
          transaction_id: getFunding.id,
          transaction_vout: transactionVout,
        },
        cbk);
      }],

      // Final funding details, including a refund paying out of transit
      funding: [
        'getFunding',
        'getRefund',
        'getTransitKey',
        'transactionVout',
        ({getFunding, getRefund, getTransitKey, transactionVout}, cbk) =>
      {
        return cbk(null, {
          id: getFunding.id,
          index: getTransitKey.index,
          inputs: getFunding.inputs,
          psbt: getFunding.psbt,
          refund: getRefund.refund,
          transaction: getFunding.transaction,
          vout: transactionVout,
        });
      }],
    },
    returnResult({reject, resolve, of: 'funding'}));
  });
};
