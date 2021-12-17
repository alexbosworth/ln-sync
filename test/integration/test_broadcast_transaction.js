const asyncAuto = require('async/auto');
const asyncRetry = require('async/retry');
const {createChainAddress} = require('ln-service');
const {extractTransaction} = require('psbt');
const {getChainTransactions} = require('ln-service');
const {fundPsbt} = require('ln-service');
const {signPsbt} = require('ln-service');
const {spawnLightningCluster} = require('ln-docker-daemons');
const {test} = require('@alexbosworth/tap');

const {broadcastTransaction} = require('./../../');

const description = 'description';
const interval = 10;
const maturity = 100;
const times = 2000;
const tokens = 1e6;

return test('Transaction is broadcast', async ({end, fail, strictSame}) => {
  const [{generate, kill, lnd}] = (await spawnLightningCluster({})).nodes;

  // Make funds for the node
  await generate({count: maturity});

  try {
    const {address} = await createChainAddress({lnd});

    const {psbt} = await signPsbt({
      lnd,
      psbt: (await fundPsbt({lnd, outputs: [{address, tokens}]})).psbt,
    });

    const {transaction} = extractTransaction({psbt});

    // Broadcast the transaction into a block while mining
    const {mine} = await asyncAuto({
      // Try publishing the tx
      broadcast: async () => {
        return await asyncRetry({interval, times}, async () => {
          return await broadcastTransaction({
            lnd,
            description,
            transaction,
            logger: {info: () => {}},
          });
        });
      },

      // Keep the blockchain going forward
      mine: async () => await asyncRetry({interval, times}, async () => {
        const {transactions} = await getChainTransactions({lnd});

        const tx = transactions.find(n => n.transaction === transaction);

        // The transaction needs to get mined
        await generate({});

        if (!tx || !tx.is_confirmed) {
          throw new Error('ExpectedTransactionConfirmedIntoABlock');
        }

        return tx;
      }),
    });

    strictSame(mine.description, description, 'Got tx confirmed into block');
    strictSame(mine.is_confirmed, true, 'Tx is confirmed into a block');
  } catch (err) {
    strictSame(err, null, 'No error is expected');
  } finally {
    await kill({});
  }

  return end();
});
