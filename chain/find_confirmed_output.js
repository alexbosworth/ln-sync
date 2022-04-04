const asyncAuto = require('async/auto');
const {returnResult} = require('asyncjs-util');
const {subscribeToChainAddress} = require('ln-service');
const {Transaction} = require('bitcoinjs-lib');

const defaultMinConfirmations = 1;
const {fromHex} = Transaction;
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const notFoundIndex = -1;

/** Find a confirmed on-chain output

  {
    lnd: <Authenticated LND API Object>
    [min_confirmations]: <Minimum Confirmations Count Number>
    output_script: <Chain Output Script Hex String>
    start_height: <Start Chain Height Number>
    timeout_ms: <Timeout Milliseconds Number>
    tokens: <Tokens Sent To Script Number>
  }

  @returns via cbk or Promise
  {
    confirmation_height: <Transaction Confirmed At Height Number>
    is_coinbase: <Transaction is Coinbase Transaction Bool>
    transaction_id: <Transaction Id Hex String>
    transaction_vout: <Transaction Output Index Number>
  }
*/
module.exports = (args, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!args.lnd) {
          return cbk([400, 'ExpectedAuthenticatedLndToFindOnchainOutput']);
        }

        if (!args.output_script) {
          return cbk([400, 'ExpectedOutputScriptToFindOnchainOutput']);
        }

        if (!args.start_height) {
          return cbk([400, 'ExpectedStartHeightToFindOnchainOutput']);
        }

        if (!args.timeout_ms) {
          return cbk([400, 'ExpectedTimeoutToFindOnchainOutputBy']);
        }

        if (!args.tokens) {
          return cbk([400, 'ExpectedTokensAmountToFindOnchainOutput']);
        }

        return cbk();
      },

      // Find the deposit
      findDeposit: ['validate', ({}, cbk) => {
        const sub = subscribeToChainAddress({
          lnd: args.lnd,
          min_confirmations: args.min_confirmations || defaultMinConfirmations,
          min_height: args.start_height,
          output_script: args.output_script,
        });

        const timeout = setTimeout(() => {
          sub.removeAllListeners();

          return cbk([503, 'TimedOutWaitingForOnchainOutput']);
        },
        args.timeout_ms);

        const done = (err, res) => {
          clearTimeout(timeout);

          sub.removeAllListeners();

          return cbk(err, res);
        };

        // Wait for the confirmation of the tx paying to the output
        sub.on('confirmation', ({height, transaction}) => {
          const outputScript = hexAsBuffer(args.output_script);
          const tx = fromHex(transaction);

          // Find the matching output
          const vout = tx.outs.findIndex(({script, value}) => {
            return value === args.tokens && script.equals(outputScript);
          });

          // Make sure the output was found
          if (vout === notFoundIndex) {
            return;
          }

          return done(null, {
            confirmation_height: height,
            is_coinbase: tx.isCoinbase(),
            transaction_id: tx.getId(),
            transaction_vout: vout,
          });
        });

        sub.on('error', err => done(err));

        return;
      }],
    },
    returnResult({reject, resolve, of: 'findDeposit'}, cbk));
  });
};
