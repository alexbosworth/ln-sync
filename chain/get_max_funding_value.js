const asyncAuto = require('async/auto');
const asyncEach = require('async/each');
const asyncify = require('async/asyncify');
const {createFundedPsbt} = require('ln-service');
const {decodePsbt} = require('psbt');
const {returnResult} = require('asyncjs-util');
const {sizeOfTransaction} = require('@alexbosworth/blockchain');
const {unlockUtxo} = require('ln-service');

const {ceil} = Math;
const defaultMaxFeeRatio = 0.2;
const detailsOf = err => (((err || [])[2] || {}).err || {}).details || '';
const dummyChangeTokens = 1;
const dummyP2trScript = '5120' + Buffer.alloc(32).toString('hex');
const dustTokensPerVbyte = 3;
const {floor} = Math;
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const isFeeMtokens = n => Number.isSafeInteger(n) && n > 0;
const isFeeTokens = n => Number.isFinite(n) && n > 0;
const isFeeTooHigh = details => /on total output value/.test(details);
const isHex = n => !!n && !(n.length % 2) && /^[0-9A-F]*$/i.test(n);
const isInsufficient = details => /not enough witness outputs/.test(details);
const isKnownChangeFormat = format => !format || format === 'p2tr';
const isMissingUtxoInfo = details => /UTXO info/.test(details);
const {isArray} = Array;
const isNestedScript = n => /^a914[0-9a-f]{40}87$/i.test(n);
const isP2trScript = n => /^5120[0-9a-f]{64}$/i.test(n);
const isTokens = n => Number.isSafeInteger(n) && n >= 0;
const isTxId = n => /^[0-9A-F]{64}$/i.test(n);
const isUnsupportedScript = details => /parsing change script/.test(details);
const isVout = n => Number.isInteger(n) && n >= 0;
const isWitnessLength = n => n.length >= 4 && n.length <= 42;
const isWitnessPush = n => n[1] + 2 === n.length;
const isWitnessVersion = n => !n || (n >= 0x51 && n <= 0x60);
const legacySpendVbytes = 32 + 4 + 1 + 107 + 4;
const {max} = Math;
const mtokensPerToken = 1e3;
const nestedScriptSigWeight = 23 * 4;
const noCoinSelectionMinConfs = 2147483647;
const noShortfall = 0;
const outputBaseVbytes = 8 + 1;
const p2trKeySpendWitnessWeight = 1 + 1 + 64;
const p2wpkhWitnessWeight = 1 + 1 + 73 + 1 + 33;
const sumOf = arr => arr.reduce((sum, n) => sum + n, Number());
const weightPerVbyte = 4;
const witnessHeaderWeight = 2;
const witnessSpendVbytes = 32 + 4 + 1 + 26 + 4;

/** Find the max amount that can be used for a funding output given inputs

  The max is for one more output in addition to any `outputs`. Without an
  `output_script` it is sized as a 34 byte script (P2TR or P2WSH, like a
  channel funding output), so it is exact for those and slightly low for
  shorter scripts like P2WPKH. Pass `output_script` to size it exactly.

  `output_script` can be P2PKH, P2SH, P2WPKH, P2WSH or P2TR

  The inputs do not need to be locked, they are not locked by this method, and
  no other wallet coins will be selected to add to them

  Inputs are not checked to be unspent, locking them before funding does that

  The max is for a transaction that is funded by `createFundedPsbt` with the
  same inputs, outputs, and fee rate. Legacy `fundPsbt` funding will consider
  the max to be insufficient since it always budgets for a change output.

  `change_format` options: `p2tr` (the size used without an `output_script`)

  `fee_mtokens_per_vbyte` is a precise fee rate, as an alternative to
  `fee_tokens_per_vbyte`. One of them is required.

  `max_fee_ratio` is the highest fee to total output value ratio to allow,
  LND uses 0.2 when it is not set

  {
    [change_format]: <Max Output Address Format String>
    [fee_mtokens_per_vbyte]: <Funding Fee Millitokens Per VByte Number>
    [fee_tokens_per_vbyte]: <Funding Fee Tokens Per VByte Number>
    inputs: [{
      transaction_id: <UTXO Transaction Id Hex String>
      transaction_vout: <UTXO Transaction Output Index Number>
    }]
    lnd: <Authenticated LND API Object>
    [max_fee_ratio]: <Maximum Fee To Total Output Value Ratio Number>
    [output_script]: <Max Output Script Hex String>
    [outputs]: [{
      script: <Output Script Hex String>
      tokens: <Output Value Tokens Number>
    }]
  }

  @returns via cbk or Promise
  {
    fee_tokens_per_vbyte: <Estimated Final Fee Tokens Per VByte Number>
    max_tokens: <Maximum Spendable Tokens For Max Output Number>
  }
*/
module.exports = (args, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!isKnownChangeFormat(args.change_format)) {
          return cbk([400, 'ExpectedKnownChangeFormatToGetMaxFundingValue']);
        }

        if (!!args.change_format && args.output_script !== undefined) {
          return cbk([400, 'ExpectedEitherChangeFormatOrOutputScriptNotBoth']);
        }

        const feeMtokens = args.fee_mtokens_per_vbyte;
        const feeTokens = args.fee_tokens_per_vbyte;

        if (feeMtokens === undefined && feeTokens === undefined) {
          return cbk([400, 'ExpectedFeeRateToCalculateMaxFundingValue']);
        }

        if (feeMtokens !== undefined && feeTokens !== undefined) {
          return cbk([400, 'ExpectedEitherFeeMtokensOrTokensPerVbyteNotBoth']);
        }

        if (feeMtokens !== undefined && !isFeeMtokens(feeMtokens)) {
          return cbk([400, 'ExpectedPositiveFeeMtokensPerVbyteForMaxFunding']);
        }

        if (feeTokens !== undefined && !isFeeTokens(feeTokens)) {
          return cbk([400, 'ExpectedPositiveFeeTokensPerVbyteForMaxFunding']);
        }

        if (!isArray(args.inputs) || !args.inputs.length) {
          return cbk([400, 'ExpectedArrayOfInputsToCalculateMaxFundingValue']);
        }

        const isOutpoints = args.inputs.every(n => {
          return !!n && isTxId(n.transaction_id) && isVout(n.transaction_vout);
        });

        if (!isOutpoints) {
          return cbk([400, 'ExpectedOutpointsForInputsToGetMaxFundingValue']);
        }

        if (!args.lnd) {
          return cbk([400, 'ExpectedAuthenticatedLndApiToCalcMaxFundingVal']);
        }

        if (args.output_script !== undefined && !isHex(args.output_script)) {
          return cbk([400, 'ExpectedHexOutputScriptToGetMaxFundingValue']);
        }

        if (!!args.outputs && !isArray(args.outputs)) {
          return cbk([400, 'ExpectedArrayOfOutputsToCalcMaxFundingValue']);
        }

        const outputs = args.outputs || [];

        const isOutputs = outputs.every(n => {
          return !!n && isHex(n.script) && isTokens(n.tokens);
        });

        if (!isOutputs) {
          return cbk([400, 'ExpectedScriptAndTokensInOutputsForMaxFunding']);
        }

        return cbk();
      },

      // Determine the output script of the output that gets the max value
      script: ['validate', ({}, cbk) => {
        const script = args.output_script || dummyP2trScript;

        return cbk(null, script.toLowerCase());
      }],

      // Get the fee rate in mtokens per vbyte to calculate the fee precisely
      rate: ['validate', ({}, cbk) => {
        // Exit early when the fee rate is already in mtokens
        if (args.fee_mtokens_per_vbyte !== undefined) {
          return cbk(null, args.fee_mtokens_per_vbyte);
        }

        const rate = args.fee_tokens_per_vbyte;

        const mtokens = rate * mtokensPerToken;

        // Float noise can lift a rate that is whole in mtokens above its value
        const isWhole = floor(mtokens) / mtokensPerToken === rate;

        return cbk(null, isWhole ? floor(mtokens) : ceil(mtokens));
      }],

      // Map out the outputs to send to the PSBT template
      outputs: ['script', ({script}, cbk) => {
        // LND will add all of the leftover value to the existing change
        const change = {script, is_change: true, tokens: dummyChangeTokens};

        const outputs = (args.outputs || []).map(output => ({
          script: output.script,
          tokens: output.tokens,
        }));

        return cbk(null, [change].concat(outputs));
      }],

      // Fund the template PSBT to have LND put the leftover into the change
      createTemplate: ['outputs', ({outputs}, cbk) => {
        return createFundedPsbt({
          outputs,
          fee_mtokens_per_vbyte: args.fee_mtokens_per_vbyte,
          fee_tokens_per_vbyte: args.fee_tokens_per_vbyte,
          inputs: args.inputs.map(input => ({
            transaction_id: input.transaction_id,
            transaction_vout: input.transaction_vout,
          })),
          lnd: args.lnd,
          max_fee_ratio: args.max_fee_ratio,
          // No wallet UTXO has this many confs, so no coins can be added
          min_confirmations: noCoinSelectionMinConfs,
        },
        (err, res) => {
          const details = detailsOf(err);

          if (isInsufficient(details)) {
            return cbk([400, 'InsufficientFundsToCalculateMaxFundingValue']);
          }

          if (isFeeTooHigh(details)) {
            return cbk([400, 'MaxFeeRatioExceededForMaxFunding', {details}]);
          }

          if (isMissingUtxoInfo(details)) {
            return cbk([400, 'ExpectedWalletUtxoInputsToGetMaxFundingValue']);
          }

          if (isUnsupportedScript(details)) {
            return cbk([400, 'UnsupportedOutputScriptToGetMaxFundingValue']);
          }

          if (!!err) {
            return cbk(err);
          }

          return cbk(null, res);
        });
      }],

      // Release any coins that LND added and locked, which it should not do
      unlockAdded: ['createTemplate', ({createTemplate}, cbk) => {
        const locked = createTemplate.inputs.filter(n => !!n.lock_id);

        return asyncEach(locked, (input, cbk) => {
          return unlockUtxo({
            id: input.lock_id,
            lnd: args.lnd,
            transaction_id: input.transaction_id,
            transaction_vout: input.transaction_vout,
          },
          cbk);
        },
        cbk);
      }],

      // Decode the funded template to get the spending UTXOs and its weight
      funded: [
        'createTemplate',
        'unlockAdded',
        asyncify(({createTemplate}) =>
      {
        try {
          const {inputs, unsigned_transaction} = decodePsbt({
            psbt: createTemplate.psbt,
          });

          const {weight} = sizeOfTransaction({
            transaction: unsigned_transaction,
          });

          return {inputs, weight};
        } catch (err) {
          throw [503, 'FailedToDecodeFundedMaxValuePsbt', {err: err.message}];
        }
      })],

      // Derive the maximum funding value from the funded template
      max: [
        'createTemplate',
        'funded',
        'rate',
        'script',
        ({createTemplate, funded, rate, script}, cbk) =>
      {
        // The funded template should not have any inputs added to it
        if (createTemplate.inputs.length !== args.inputs.length) {
          return cbk([503, 'UnexpectedInputCountInFundedMaxValueTemplate']);
        }

        const change = createTemplate.outputs.find(n => !!n.is_change);

        // The change output is the output that received the leftover value
        if (!change || change.output_script !== script) {
          return cbk([503, 'ExpectedChangeOutputInFundedMaxValueTemplate']);
        }

        // Every input should be decorated with the spending UTXO details
        if (!!funded.inputs.find(n => !n.witness_utxo)) {
          return cbk([503, 'ExpectedWitnessUtxosInFundedMaxValueTemplate']);
        }

        const utxos = funded.inputs.map(n => n.witness_utxo);

        // Estimate the signed weight the same way that LND estimates it
        const witnessWeights = utxos.map(({script_pub}) => {
          if (isP2trScript(script_pub)) {
            return p2trKeySpendWitnessWeight;
          }

          if (isNestedScript(script_pub)) {
            return nestedScriptSigWeight + p2wpkhWitnessWeight;
          }

          return p2wpkhWitnessWeight;
        });

        const witnessWeight = witnessHeaderWeight + sumOf(witnessWeights);

        const vbytes = ceil((funded.weight + witnessWeight) / weightPerVbyte);

        const inTokens = sumOf(utxos.map(n => n.tokens));
        const outTokens = sumOf(createTemplate.outputs.map(n => n.tokens));

        const fee = inTokens - outTokens;

        // LND rounds the fee down by weight, so make sure each vbyte is paid
        const required = ceil(rate * vbytes / mtokensPerToken);

        const shortfall = max(noShortfall, required - fee);

        const maxTokens = change.tokens - shortfall;

        // Dust is the cost of creating and spending the output at 3/vbyte
        const bytes = hexAsBuffer(script);

        const [version] = bytes;

        const isWitness = isWitnessLength(bytes) &&
          isWitnessPush(bytes) &&
          isWitnessVersion(version);

        const spendVbytes = isWitness ? witnessSpendVbytes : legacySpendVbytes;

        const outputVbytes = outputBaseVbytes + bytes.length;

        const dust = dustTokensPerVbyte * (outputVbytes + spendVbytes);

        // Exit early when there is no room for a non-dust max output
        if (maxTokens < dust) {
          return cbk([400, 'MaxFundingValueIsBelowDustValue', {
            max_tokens: maxTokens,
          }]);
        }

        const finalFee = fee + shortfall;
        const ratio = args.max_fee_ratio || defaultMaxFeeRatio;
        const total = outTokens - shortfall;

        // LND will check the topped up fee against its cap when funding
        const maxFee = floor(total * ratio);

        if (finalFee > maxFee) {
          return cbk([400, 'MaxFeeRatioExceededForMaxFunding', {
            fee: finalFee,
            max_fee: maxFee,
          }]);
        }

        return cbk(null, {
          fee_tokens_per_vbyte: finalFee / vbytes,
          max_tokens: maxTokens,
        });
      }],
    },
    returnResult({reject, resolve, of: 'max'}, cbk));
  });
};
