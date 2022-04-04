const asyncRetry = require('async/retry');
const {createChainAddress} = require('ln-service');
const {getUtxos} = require('ln-service');
const {sendToChainAddress} = require('ln-service');
const {spawnLightningCluster} = require('ln-docker-daemons');
const {test} = require('@alexbosworth/tap');

const {findConfirmedOutput} = require('./../../');

const count = 200;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const interval = 10;
const times = 2000;
const tokens = 1e5;
const wait = 1000;

test('Find confirmed output', async ({end, fail, strictSame}) => {
  const {kill, nodes} = await spawnLightningCluster({});

  const [{generate, lnd}] = nodes;

  try {
    // Make some coins
    await generate({count});

    // Wait for chain notifier to start
    await delay(wait);

    const {utxos} = await getUtxos({lnd});

    const [utxo] = utxos.reverse();

    // Find a coinbase output
    const confirmed = await findConfirmedOutput({
      lnd,
      min_confirmations: 1,
      output_script: utxo.output_script,
      start_height: 1,
      timeout_ms: 1000 * 10,
      tokens: 2500000000,
    });

    strictSame(confirmed.is_coinbase, true, 'Found coinbase output');

    const {address} = await createChainAddress({lnd});

    await sendToChainAddress({address, lnd, tokens});

    await generate({count});

    // Wait for confirmation to be picked up
    await delay(wait);

    const sent = (await getUtxos({lnd})).utxos.find(n => n.tokens == tokens);

    // Try a very short delay
    try {
      await findConfirmedOutput({
        lnd,
        tokens,
        min_confirmations: 1,
        output_script: sent.output_script,
        start_height: 1,
        timeout_ms: 1,
      });

      fail('Should fail to find confirmed output');
    } catch (err) {
      strictSame(err, [503, 'TimedOutWaitingForOnchainOutput']);
    }

    // Find a regular output
    const confirmedSent = await findConfirmedOutput({
      lnd,
      tokens,
      min_confirmations: 1,
      output_script: sent.output_script,
      start_height: 1,
      timeout_ms: 1000 * 10,
    });

    strictSame(confirmedSent.is_coinbase, false, 'Found non-coinbase output');
  } catch (err) {
    strictSame(err, null, 'Expected no error');
  } finally {
    await kill({});

    return end();
  }
});
