const asyncAuto = require('async/auto');
const asyncEach = require('async/each');
const asyncReflect = require('async/reflect');
const {fundPsbt} = require('ln-service');
const {returnResult} = require('asyncjs-util');
const {signPsbt} = require('ln-service');
const {Transaction} = require('bitcoinjs-lib');
const {unlockUtxo} = require('ln-service');

const adjustFactor = 10;
const allowZeroConfirmationInputs = 0;
const {ceil} = Math;
const dust = 546;
const {fromHex} = Transaction;
const {isArray} = Array;
const sumOf = arr => arr.reduce((sum, n) => sum + n, Number());

/** Find the max amount that can be used for funding outputs given inputs

  {
    addresses: [<Send to Address String>]
    fee_tokens_per_vbyte: <Funding Fee Tokens Per VByte Number>
    inputs: [{
      tokens: <Input Tokens Number>
      transaction_id: <UTXO Transaction Id Hex String>
      transaction_vout: <UTXO Transaction Output Index Number>
    }]
    lnd: <Authenticated LND API Object>
  }

  @returns via cbk or Promise
  {
    fee_tokens_per_vbyte: <Effective Final Fee Tokens Per VByte Number>
    max_tokens: <Maximum Spendable Tokens Number>
  }
*/
module.exports = (args, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!isArray(args.addresses)) {
          return cbk([400, 'ExpectedArrayOfAddressesToCalculateMaxFunding']);
        }

        if (!args.fee_tokens_per_vbyte) {
          return cbk([400, 'ExpectedFeeTokensToCalculateMaxFundAmount']);
        }

        if (!isArray(args.inputs)) {
          return cbk([400, 'ExpectedArrayOfInputsToCalculateMaxFundAmount']);
        }

        if (!args.lnd) {
          return cbk([400, 'ExpectedAuthenticatedLndApiToCalcMaxFundAmount']);
        }

        return cbk();
      },

      // Create the template PSBT to figure out what the change is
      createTemplate: ['validate', ({}, cbk) => {
        return fundPsbt({
          fee_tokens_per_vbyte: args.fee_tokens_per_vbyte,
          inputs: args.inputs.map(input => ({
            transaction_id: input.transaction_id,
            transaction_vout: input.transaction_vout,
          })),
          lnd: args.lnd,
          min_confirmations: allowZeroConfirmationInputs,
          outputs: args.addresses.map(address => ({address, tokens: dust})),
        },
        cbk);
      }],

      // Unlock the UTXOs from the template
      unlockTemplate: ['createTemplate', ({createTemplate}, cbk) => {
        return asyncEach(createTemplate.inputs, (utxo, cbk) => {
          return unlockUtxo({
            id: utxo.lock_id,
            lnd: args.lnd,
            transaction_id: utxo.transaction_id,
            transaction_vout: utxo.transaction_vout,
          },
          cbk);
        },
        cbk);
      }],

      // Confirm that the PSBT can be created with the maximal amount normally
      createMaximumNormal: [
        'createTemplate',
        'unlockTemplate',
        asyncReflect(({createTemplate}, cbk) =>
      {
        // LND as of 0.13.3 sets its max funding value as a sum of all outputs
        const max = sumOf(createTemplate.outputs.map(n => n.tokens));

        // The maximum transaction will only carry over the non-change outputs
        const outs = createTemplate.outputs.filter(n => !n.is_change);

        // Calculate a baseline value for all of the non-change outputs
        const baseline = sumOf(outs.map(n => n.tokens));

        // Fund a PSBT that is the same as the template, but adding the change
        return fundPsbt({
          fee_tokens_per_vbyte: args.fee_tokens_per_vbyte,
          inputs: args.inputs.map(input => ({
            transaction_id: input.transaction_id,
            transaction_vout: input.transaction_vout,
          })),
          lnd: args.lnd,
          min_confirmations: allowZeroConfirmationInputs,
          outputs: args.addresses.map((address, i) => ({
            address,
            tokens: !i ? dust + max - baseline : dust,
          })),
        },
        cbk);
      })],

      // Make sure that maximum spend is created, or use adjusted dust value
      createMaximum: [
        'createMaximumNormal',
        'createTemplate',
        'unlockTemplate',
        ({createMaximumNormal, createTemplate}, cbk) =>
      {
        // Exit early when creating a maximum spend worked as is
        if (!!createMaximumNormal.value) {
          return cbk(null, createMaximumNormal.value);
        }

        // Repeat calculations for the spend
        const adjustment = ceil(args.fee_tokens_per_vbyte * adjustFactor);
        const max = sumOf(createTemplate.outputs.map(n => n.tokens));
        const outs = createTemplate.outputs.filter(n => !n.is_change);
        const baseline = sumOf(outs.map(n => n.tokens));

        // In LND 0.15.3 spending P2TR outputs requires adjusted dust value
        return fundPsbt({
          fee_tokens_per_vbyte: args.fee_tokens_per_vbyte,
          inputs: args.inputs.map(input => ({
            transaction_id: input.transaction_id,
            transaction_vout: input.transaction_vout,
          })),
          lnd: args.lnd,
          min_confirmations: allowZeroConfirmationInputs,
          outputs: args.addresses.map((address, i) => ({
            address,
            tokens: !i ? dust + max - baseline - adjustment : dust,
          })),
        },
        cbk);
      }],

      // Sign the maximum to get the raw transaction for fee calculation
      finalizeMaximum: ['createTemplate', ({createTemplate}, cbk) => {
        return signPsbt({lnd: args.lnd, psbt: createTemplate.psbt}, cbk);
      }],

      // Derive the maximum spendable tokens from the final TX
      max: ['finalizeMaximum', ({finalizeMaximum}, cbk) => {
        // The fee will be the difference between in tokens and out tokens
        const inTokens = args.inputs.map(n => n.tokens);

        // Use the real transaction to confirm the maximum values
        const tx = fromHex(finalizeMaximum.transaction);

        const maxTokens = sumOf(tx.outs.map(n => n.value));

        const feeTokens = inTokens - maxTokens;

        return cbk(null, {
          fee_tokens_per_vbyte: feeTokens / tx.virtualSize(),
          max_tokens: maxTokens,
        });
      }],

      // Unlock the maximum PSBT UTXOs
      unlockMaximum: [
        'createMaximum',
        'finalizeMaximum',
        ({createMaximum}, cbk) =>
      {
        return asyncEach(createMaximum.inputs, (utxo, cbk) => {
          return unlockUtxo({
            id: utxo.lock_id,
            lnd: args.lnd,
            transaction_id: utxo.transaction_id,
            transaction_vout: utxo.transaction_vout,
          },
          cbk);
        },
        cbk);
      }],
    },
    returnResult({reject, resolve, of: 'max'}, cbk));
  });
};
