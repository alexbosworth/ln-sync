const asyncRetry = require('async/retry');
const {createChainAddress} = require('ln-service');
const {getUtxos} = require('ln-service');
const {sendToChainAddress} = require('ln-service');
const {spawnLightningCluster} = require('ln-docker-daemons');
const {test} = require('@alexbosworth/tap');

const {fundPsbtDisallowingInputs} = require('./../../');

const format = 'np2wpkh';
const interval = 10;
const maturityBlocks = 100;
const size = 2;
const times = 2000;
const tokens = 1e6;

return test('Fund disallowing inputs', async ({end, rejects, strictSame}) => {
  const {kill, nodes} = await spawnLightningCluster({size});

  const [{generate, lnd}, target] = nodes;

  try {
    // Make some coins
    await generate({count: maturityBlocks});

    const {address} = await createChainAddress({format, lnd: target.lnd});

    await sendToChainAddress({address, lnd, tokens});

    await asyncRetry({interval, times}, async () => {
      await generate({});

      await sendToChainAddress({
        lnd,
        tokens,
        address: (await createChainAddress({lnd: target.lnd})).address,
      });
    });

    const utxos = await asyncRetry({interval, times}, async () => {
      await generate({});

      const {utxos} = await getUtxos({lnd: target.lnd});

      if (!utxos.length || !!utxos.find(n => !n.confirmation_count)) {
        throw new Error('ExpectedConfirmedUtxos');
      }

      return utxos;
    });

    const fundWhileAvoiding = fundPsbtDisallowingInputs({
      disallow_inputs: utxos.filter(n => n.address_format === format),
      lnd: target.lnd,
      outputs: [{address, tokens: tokens + (tokens / 2)}],
    });

    await rejects(
      fundWhileAvoiding,
      [503, 'UnexpectedErrorFundingTransaction'],
      'Insufficient funding'
    );

    const funds = await fundPsbtDisallowingInputs({
      disallow_inputs: utxos.filter(n => n.address_format === format),
      lnd: target.lnd,
      outputs: [{address, tokens: (tokens / 2)}],
    });

    strictSame(funds.outputs.length , 2, 'Got expected outputs');
  } catch (err) {
    strictSame(err, null, 'Expected no error');
  } finally {
    await kill({});

    return end();
  }
});
