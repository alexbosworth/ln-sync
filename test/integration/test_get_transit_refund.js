const {deepEqual} = require('node:assert').strict;
const test = require('node:test');

const asyncRetry = require('async/retry');
const {broadcastChainTransaction} = require('ln-service');
const {componentsOfTransaction} = require('@alexbosworth/blockchain');
const {createChainAddress} = require('ln-service');
const {encodeBech32Address} = require('@alexbosworth/blockchain');
const {getChainTransactions} = require('ln-service');
const {getPublicKey} = require('ln-service');
const {hashForP2wpkh} = require('@alexbosworth/blockchain');
const {idForTransaction} = require('@alexbosworth/blockchain');
const {sendToChainAddress} = require('ln-service');
const {spawnLightningCluster} = require('ln-docker-daemons');

const {getNetwork} = require('./../../');
const {getTransitRefund} = require('./../../');

const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const maturityBlocks = 100;
const prefixes = {bitcoin: 'bc', regtest: 'bcrt', testnet: 'tb'};
const tokens = 1e6;
const transitKeyFamily = 805;
const witnessVersion = 0;

return test('Get a refund transaction', async () => {
  const {kill, nodes} = await spawnLightningCluster({});

  const [{generate, id, lnd}] = nodes;

  try {
    // Make some coins
    await generate({count: maturityBlocks});

    // Derive a transit key
    const transitKey = await getPublicKey({lnd, family: transitKeyFamily});

    // The transit address pays to the hash of the transit public key
    const {hash} = hashForP2wpkh({
      key: hexAsBuffer(transitKey.public_key),
    });

    // Put together the transit address
    const {address} = encodeBech32Address({
      prefix: prefixes[(await getNetwork({lnd})).bitcoinjs],
      program: hash,
      version: witnessVersion,
    });

    // Move coins to the transit address
    const {id} = await sendToChainAddress({address, lnd, tokens});

    // The send should be in the tx list
    const {transactions} = await getChainTransactions({lnd});

    // It will be the unconfirmed one
    const {transaction} = transactions.find(n => !n.is_confirmed);

    // The spending output index will match the send value
    const index = componentsOfTransaction({transaction}).outputs.findIndex(n => {
      return n.tokens === tokens;
    });

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
        return tx.id === idForTransaction({transaction: refund}).id;
      });

      if (!!got.is_confirmed) {
        return;
      }

      await generate({});

      throw new Error('ExpectedRefundTransactionConfirmed');
    });
  } catch (err) {
    deepEqual(err, null, 'Expected no error');
  }

  await kill({});

  return;
});
