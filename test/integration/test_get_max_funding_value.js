const {deepEqual} = require('node:assert').strict;
const {equal} = require('node:assert').strict;
const test = require('node:test');

const asyncRetry = require('async/retry');
const {componentsOfTransaction} = require('@alexbosworth/blockchain');
const {createChainAddress} = require('ln-service');
const {createFundedPsbt} = require('ln-service');
const {decodePsbt} = require('psbt');
const {getLockedUtxos} = require('ln-service');
const {getUtxos} = require('ln-service');
const {lockUtxo} = require('ln-service');
const {outputScriptForAddress} = require('@alexbosworth/blockchain');
const {signPsbt} = require('ln-service');
const {sizeOfTransaction} = require('@alexbosworth/blockchain');
const {spawnLightningCluster} = require('ln-docker-daemons');
const {unlockUtxo} = require('ln-service');

const {getMaxFundingValue} = require('./../../');

const interval = 10;
const maturityBlocks = 100;
const network = 'btcregtest';
const times = 1000;

// The P2TR output is the default size, P2WPKH needs its output script
const cases = [
  {
    fee: {fee_tokens_per_vbyte: 3},
    format: 'p2tr',
    is_default_size: true,
    rate: 3,
  },
  {fee: {fee_mtokens_per_vbyte: 2500}, format: 'p2wpkh', rate: 2.5},
];

return test('Get the max funding value', async () => {
  const {kill, nodes} = await spawnLightningCluster({});

  const [{generate, lnd}] = nodes;

  try {
    // Get a funding address
    const {address} = await createChainAddress({lnd, format: 'p2wpkh'});

    // Make some coins
    await generate({address, count: maturityBlocks});

    // Wait for balance to appear
    const utxo = await asyncRetry({interval, times}, async () => {
      const [utxo] = (await getUtxos({lnd})).utxos;

      if (!utxo) {
        throw new Error('ExpectedUtxoFromGeneration');
      }

      return utxo;
    });

    const input = {
      transaction_id: utxo.transaction_id,
      transaction_vout: utxo.transaction_vout,
    };

    for (const {fee, format, is_default_size, rate} of cases) {
      const destination = await createChainAddress({format, lnd});

      const {script} = outputScriptForAddress({
        network,
        address: destination.address,
      });

      const maximum = await getMaxFundingValue({
        lnd,
        ...fee,
        inputs: [input],
        output_script: !!is_default_size ? undefined : script,
      });

      deepEqual(await getLockedUtxos({lnd}), {utxos: []}, 'No UTXOs locked');

      // Funding a coin select PSBT requires that the inputs are locked
      const lock = await lockUtxo({lnd, ...input});

      const {psbt} = await createFundedPsbt({
        lnd,
        ...fee,
        inputs: [input],
        outputs: [{script, tokens: maximum.max_tokens}],
      });

      const tx = componentsOfTransaction({
        transaction: decodePsbt({psbt}).unsigned_transaction,
      });

      deepEqual(tx.inputs.length, [input].length, 'No coins were added');

      deepEqual(
        tx.outputs,
        [{script, tokens: maximum.max_tokens}],
        'No change output was added'
      );

      const {transaction} = await signPsbt({lnd, psbt});

      const {vsize} = sizeOfTransaction({transaction});

      const feeRate = (utxo.tokens - maximum.max_tokens) / vsize;

      equal(feeRate >= rate, true, 'Fee rate is paid');
      equal(maximum.fee_tokens_per_vbyte >= rate, true, 'Got fee rate');

      await unlockUtxo({lnd, id: lock.id, ...input});
    }
  } catch (err) {
    equal(err, null, 'Expected no error');
  } finally {
    await kill({});
  }

  return;
});
