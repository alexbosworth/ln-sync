const asyncRetry = require('async/retry');
const {createChainAddress} = require('lightning');
const {getChainBalance} = require('lightning');
const {getUtxos} = require('lightning');
const {test} = require('@alexbosworth/tap');
const {spawnLightningCluster} = require('ln-docker-daemons');

const {getMaxFundAmount} = require('./../../');

const feeTokensPerVbyte = 3;
const interval = 10;
const maturityBlocks = 100;
const times = 1000;

const tests = [
  {
    args: ({lnd}) => ({lnd}),
    description: 'Get network name',
    expected: ({}) => ({network: 'btcregtest'}),
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async ({end, fail, strictSame}) => {
    const {nodes} = await spawnLightningCluster({});

    const [{generate, id, kill, lnd}] = nodes;

    // Get a funding address
    const {address} = await createChainAddress({lnd, format: 'p2wpkh'});

    // Make some coins
    await generate({address, count: maturityBlocks});

    // Wait for balance to appear
    const utxo = await asyncRetry({interval, times}, async () => {
      const {utxos} = await getUtxos({lnd});

      const [utxo] = utxos;

      if (!utxo) {
        throw new Error('ExpectedUtxoFromGeneration');
      }

      return utxo;
    });

    const maximum = await getMaxFundAmount({
      lnd,
      addresses: [address],
      fee_tokens_per_vbyte: feeTokensPerVbyte,
      inputs: [{
        tokens: utxo.tokens,
        transaction_id: utxo.transaction_id,
        transaction_vout: utxo.transaction_vout,
      }],
    });

    strictSame(
      maximum,
      {fee_tokens_per_vbyte: 3, max_tokens: 4999999577},
      'Maximum funding for inputs is returned'
    );

    await kill({});

    return end();
  });
});