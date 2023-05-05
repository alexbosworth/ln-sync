const asyncAuto = require('async/auto');
const {broadcastChainTransaction} = require('ln-service');
const {getHeight} = require('ln-service');
const {returnResult} = require('asyncjs-util');
const {subscribeToBlocks} = require('ln-service');
const {subscribeToChainAddress} = require('ln-service');
const {Transaction} = require('bitcoinjs-lib');

const bufferAsHex = buffer => buffer.toString('hex');
const {fromHex} = Transaction;
const fuzzBlocks = 10;
const isHex = n => !!n && !(n.length % 2) && /^[0-9A-F]*$/i.test(n);
const maxLockTime = 500000000;
const maxSequence = 0xFFFFFFFF;

/** Broadcast a chain transaction until it gets confirmed in a block

  {
    [description]: <Transaction Description String>
    lnd: <Authenticated LND API Object>
    logger: <Winston Logger Object>
    transaction: <Transaction String>
  }

  @returns via cbk or Promise
  {
    transaction_confirmed_in_block: <Block Height Number>
  }
*/
module.exports = ({description, lnd, logger, transaction}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!lnd) {
          return cbk([400, 'ExpectedLndToBroadcastTransaction']);
        }

        if (!logger) {
          return cbk([400, 'ExpectedLoggerToBroadcastTransaction']);
        }

        if (!isHex(transaction)) {
          return cbk([400, 'ExpectedHexEncodedSignedTransactionToBroadcast']);
        }

        try {
          fromHex(transaction);
        } catch (err) {
          return cbk([400, 'ExpectedSignedTransactionToBroadcast', {err}]);
        }

        return cbk();
      },

      // Get the current block height for watching for confirmation
      getHeight: ['validate', ({}, cbk) => getHeight({lnd}, cbk)],

      // Wait for locktime height
      waitForLockTime: ['getHeight', ({getHeight}, cbk) => {
        const {ins, locktime} = fromHex(transaction);

        // Exit early when all inputs have max sequence and timelock is ignored
        if (!ins.filter(n => n.sequence !== maxSequence).length) {
          return cbk();
        }

        // Exit early when not waiting for lock time
        if (locktime >= maxLockTime) {
          return cbk();
        }

        // Exit early when not constrained
        if (locktime <= getHeight.current_block_height) {
          return cbk();
        }

        const sub = subscribeToBlocks({lnd});

        sub.on('block', ({height}) => {
          // Exit early when the locked height is no longer in the future
          if (locktime <= height) {
            sub.removeAllListeners();

            return cbk();
          }

          return logger.info({timelocked_until: locktime, current: height});
        });

        sub.on('error', err => {
          sub.removeAllListeners();

          return cbk([503, 'UnexpectedErrorSubscribingToBlocks', {err}]);
        });
      }],

      // Push transaction to the mempool and keep pushing until it's confirmed
      broadcast: ['getHeight', 'waitForLockTime', ({getHeight}, cbk) => {
        let isConfirmed = false;
        const [{script}] = fromHex(transaction).outs;

        // Subscribe to blocks
        const blocksSub = subscribeToBlocks({lnd});

        logger.info({transaction_id: fromHex(transaction).getId()});

        // Subscribe to confirmations of the first output script
        const confirmationSub = subscribeToChainAddress({
          lnd,
          min_height: getHeight.current_block_height - fuzzBlocks,
          output_script: bufferAsHex(script),
          transaction_id: fromHex(transaction).getId(),
        });

        const returnError = err => {
          [blocksSub, confirmationSub].forEach(n => n.removeAllListeners());

          return cbk([503, 'UnexpectedErrorBroadcastingTransaction', {err}]);
        };

        blocksSub.on('error', err => returnError(err));
        confirmationSub.on('error', err => returnError(err));

        // Broadcast the transaction every block
        blocksSub.on('block', async ({height}) => {
          try {
            await broadcastChainTransaction({description, lnd, transaction});
          } catch (err) {
            return returnError(err);
          }

          if (!!isConfirmed) {
            return;
          }

          return logger.info({broadcast_transaction_at_height: height});
        });

        // Wait for confirmation to continue
        confirmationSub.on('confirmation', ({height, transaction}) => {
          isConfirmed = true;

          [blocksSub, confirmationSub].forEach(n => n.removeAllListeners());

          return cbk(null, {transaction_confirmed_in_block: height});
        });

        return;
      }],
    },
    returnResult({reject, resolve, of: 'broadcast'}, cbk));
  });
};
