const {deepEqual} = require('node:assert').strict;
const test = require('node:test');

const asyncRetry = require('async/retry');
const {broadcastChainTransaction} = require('ln-service');
const {componentsOfTransaction} = require('@alexbosworth/blockchain');
const {createChainAddress} = require('ln-service');
const {createPsbt} = require('psbt');
const {decodePsbt} = require('psbt');
const {extendPsbt} = require('psbt');
const {extractTransaction} = require('psbt');
const {finalizePsbt} = require('psbt');
const {fundPsbt} = require('ln-service');
const {getChainTransactions} = require('ln-service');
const {getHeight} = require('ln-service');
const {getUtxos} = require('ln-service');
const {idForTransaction} = require('@alexbosworth/blockchain');
const {sendToChainAddress} = require('ln-service');
const {spawnLightningCluster} = require('ln-docker-daemons');
const {unlockUtxo} = require('ln-service');

const {signAndFundPsbt} = require('./../../');

const asOutpoint = n => `${n.id}:${n.vout}`;
const fee = 10000;
const fundingScript = '0020' + '77'.repeat(32);
const interval = 10;
const locktimeBuffer = 18;
const maturityBlocks = 100;
const sumOf = arr => arr.reduce((sum, n) => sum + n, 0);
const times = 2000;
const tokens = {p2tr: 2e6, p2wpkh: 1e6};

return test('Sign and fund a PSBT', async () => {
  const {kill, nodes} = await spawnLightningCluster({});

  const [{generate, lnd}] = nodes;

  try {
    // Make some coins
    await generate({count: maturityBlocks});

    // Make a P2TR and a P2WPKH UTXO to spend, the P2TR UTXO is the largest
    const addresses = [];

    for (const format of Object.keys(tokens)) {
      const {address} = await createChainAddress({format, lnd});

      await asyncRetry({interval, times}, async () => {
        await generate({});

        await sendToChainAddress({address, lnd, tokens: tokens[format]});
      });

      addresses.push(address);
    }

    // Wait for the UTXOs to confirm
    const spending = await asyncRetry({interval, times}, async () => {
      await generate({});

      const {utxos} = await getUtxos({lnd});

      const spend = addresses.map(address => {
        return utxos.find(n => n.address === address);
      });

      if (spend.findIndex(n => !n || !n.confirmation_count) !== -1) {
        throw new Error('ExpectedConfirmedUtxosToSpend');
      }

      return spend;
    });

    // Have LND describe the UTXOs to get their derivation paths
    const described = await fundPsbt({
      lnd,
      inputs: spending.map(utxo => ({
        transaction_id: utxo.transaction_id,
        transaction_vout: utxo.transaction_vout,
      })),
      outputs: [{
        address: (await createChainAddress({lnd})).address,
        tokens: sumOf(spending.map(n => n.tokens)) / 2,
      }],
    });

    // Release the UTXOs so that they can be used to make the conflict tx
    for (const input of described.inputs) {
      await unlockUtxo({
        lnd,
        id: input.lock_id,
        transaction_id: input.transaction_id,
        transaction_vout: input.transaction_vout,
      });
    }

    const decoded = decodePsbt({psbt: described.psbt});

    const describedTx = componentsOfTransaction({
      transaction: decoded.unsigned_transaction,
    });

    const utxos = describedTx.inputs.map((input, vin) => ({
      bip32_derivations: decoded.inputs[vin].bip32_derivations,
      non_witness_utxo: decoded.inputs[vin].non_witness_utxo,
      transaction_id: input.id,
      transaction_vout: input.vout,
      witness_utxo: decoded.inputs[vin].witness_utxo,
    }));

    // The unsigned PSBT spends the UTXOs into a funding output
    const unsigned = createPsbt({
      outputs: [{
        script: fundingScript,
        tokens: sumOf(spending.map(n => n.tokens)) - fee,
      }],
      utxos: utxos.map(utxo => ({
        id: utxo.transaction_id,
        vout: utxo.transaction_vout,
      })),
    });

    // The base PSBT has the spent UTXOs, but no signing details
    const base = extendPsbt({
      inputs: utxos.map(utxo => ({
        non_witness_utxo: utxo.non_witness_utxo,
        witness_utxo: utxo.witness_utxo,
      })),
      psbt: unsigned.psbt,
    });

    const startHeight = (await getHeight({lnd})).current_block_height;

    const res = await signAndFundPsbt({lnd, utxos, psbt: base.psbt});

    const baseTx = decodePsbt({psbt: base.psbt}).unsigned_transaction;

    // The signed PSBT should finalize, checking every signature in it
    const funding = extractTransaction({
      psbt: finalizePsbt({psbt: res.psbt}).psbt,
    });

    deepEqual(
      idForTransaction({transaction: funding.transaction}).id,
      idForTransaction({transaction: baseTx}).id,
      'Signed PSBT is the base funding transaction'
    );

    // The dummy funding PSBT should also be for the base transaction
    const dummy = decodePsbt({psbt: res.funding});

    deepEqual(
      idForTransaction({transaction: dummy.unsigned_transaction}).id,
      idForTransaction({transaction: baseTx}).id,
      'Dummy funding PSBT is for the base funding transaction'
    );

    // The conflict transaction spends the largest UTXO
    const conflict = componentsOfTransaction({transaction: res.conflict});
    const fundingTx = componentsOfTransaction({
      transaction: funding.transaction,
    });

    const [largest] = spending.slice().sort((a, b) => b.tokens - a.tokens);

    deepEqual(conflict.inputs.length, 1, 'Conflict spends a single input');

    deepEqual(
      asOutpoint(conflict.inputs[0]),
      `${largest.transaction_id}:${largest.transaction_vout}`,
      'Conflict spends the largest UTXO'
    );

    deepEqual(
      fundingTx.inputs.map(asOutpoint).includes(
        asOutpoint(conflict.inputs[0])
      ),
      true,
      'Conflict spends an input of the funding transaction'
    );

    deepEqual(
      conflict.locktime,
      startHeight + locktimeBuffer,
      'Conflict is timelocked'
    );

    const {id} = idForTransaction({transaction: res.conflict});

    // Publish the conflict once it is final and mine it into a block
    const tx = await asyncRetry({interval, times}, async () => {
      await generate({});

      const {transactions} = await getChainTransactions({lnd});

      const tx = transactions.find(n => n.id === id);

      // Exit early when the conflict is confirmed
      if (!!tx && !!tx.is_confirmed) {
        return tx;
      }

      // The conflict can only be published once its timelock has passed
      await broadcastChainTransaction({lnd, transaction: res.conflict});

      throw new Error('ExpectedConflictConfirmedIntoABlock');
    });

    deepEqual(tx.is_confirmed, true, 'The conflict tx is confirmed');
  } catch (err) {
    deepEqual(err, null, 'Expected no error');
  } finally {
    await kill({});
  }

  return;
});
