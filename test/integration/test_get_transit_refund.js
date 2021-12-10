const asyncRetry = require('async/retry');
const {broadcastChainTransaction} = require('lightning');
const {createChainAddress} = require('lightning');
const {getChainTransactions} = require('lightning');
const {getPublicKey} = require('lightning');
const {networks} = require('bitcoinjs-lib');
const {payments} = require('bitcoinjs-lib');
const {sendToChainAddress} = require('lightning');
const {spawnLightningCluster} = require('ln-docker-daemons');
const {test} = require('@alexbosworth/tap');
const {Transaction} = require('bitcoinjs-lib');

const {getNetwork} = require('./../../');
const {getTransitRefund} = require('./../../');

const {fromHex} = Transaction;
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const maturityBlocks = 100;
const {p2wpkh} = payments;
const tokens = 1e6;
const transitKeyFamily = 805;

return test('Get a refund transaction', async ({end, fail, strictSame}) => {
  const {kill, nodes} = await spawnLightningCluster({});

  const [{generate, id, lnd}] = nodes;

  try {
    // Make some coins
    await generate({count: maturityBlocks});

    // Derive a transit key
    const transitKey = await getPublicKey({lnd, family: transitKeyFamily});

    // Put together the transit address
    const {address} = p2wpkh({
      pubkey: hexAsBuffer(transitKey.public_key),
      network: networks[(await getNetwork({lnd})).bitcoinjs],
    });

    // Move coins to the transit address
    const {id} = await sendToChainAddress({address, lnd, tokens});

    // The send should be in the tx list
    const {transactions} = await getChainTransactions({lnd});

    // It will be the unconfirmed one
    const {transaction} = transactions.find(n => !n.is_confirmed);

    // The spending output index will match the send value
    const index = fromHex(transaction).outs.findIndex(n => n.value === tokens);

    // Make the refund of the transit funds into the refund address
    const {refund} = await getTransitRefund({
      lnd,
      funded_tokens: tokens,
      network: (await getNetwork({lnd})).network,
      refund_address: (await createChainAddress({lnd})).address,
      transit_address: address,
      transit_key_index: transitKey.index,
      transit_public_key: transitKey.public_key,
      transaction_id: id,
      transaction_vout: index,
    });

    // Mine the refund into a block
    await asyncRetry({times: maturityBlocks}, async () => {
      await broadcastChainTransaction({lnd, transaction: refund});

      const got = (await getChainTransactions({lnd})).transactions.find(tx => {
        return tx.id === fromHex(refund).getId();
      });

      if (!!got.is_confirmed) {
        return;
      }

      await generate({});

      throw new Error('ExpectedRefundTransactionConfirmed');
    });
  } catch (err) {
    strictSame(err, null, 'Expected no error');
  } finally {
    await kill({});

    return end();
  }
});
