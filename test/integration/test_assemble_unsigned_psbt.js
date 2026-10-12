const {deepEqual} = require('node:assert').strict;
const {equal} = require('node:assert').strict;
const test = require('node:test');

const asyncRetry = require('async/retry');
const {broadcastChainTransaction} = require('ln-service');
const {componentsOfTransaction} = require('@alexbosworth/blockchain');
const {createChainAddress} = require('ln-service');
const {decodeBech32Address} = require('@alexbosworth/blockchain');
const {decodePsbt} = require('psbt');
const {extendPsbt} = require('psbt');
const {extractTransaction} = require('psbt');
const {finalizePsbt} = require('psbt');
const {fundPsbt} = require('ln-service');
const {getChainTransactions} = require('ln-service');
const {getUtxos} = require('ln-service');
const {idForTransaction} = require('@alexbosworth/blockchain');
const {partiallySignPsbt} = require('ln-service');
const {sendToChainAddress} = require('ln-service');
const {sizeOfTransaction} = require('@alexbosworth/blockchain');
const {spawnLightningCluster} = require('ln-docker-daemons');
const {unlockUtxo} = require('ln-service');

const {assembleUnsignedPsbt} = require('./../../');

const asOutpoint = n => `${n.id}:${n.vout}`;
const capacity = 1e6;
const fundingScript = '0020' + '77'.repeat(32);
const hashAll = 1;
const hashDefault = 0;
const interval = 10;
const maturityBlocks = 100;
const rate = 2;
const size = 2;
const sumOf = arr => arr.reduce((sum, n) => sum + n, 0);
const times = 2000;

return test('Assemble an unsigned PSBT', async () => {
  const {kill, nodes} = await spawnLightningCluster({size});

  const [{generate, lnd}, target] = nodes;

  try {
    // The first member funds with P2WPKH, the second member with P2TR
    const members = [
      {format: 'p2wpkh', lnd, tokens: 3e6},
      {format: 'p2tr', lnd: target.lnd, tokens: 2e6},
    ];

    // Make some coins
    await generate({count: maturityBlocks});

    // Send each member a UTXO to fund the transaction with
    for (const member of members) {
      const {address} = await createChainAddress({
        format: member.format,
        lnd: member.lnd,
      });

      await asyncRetry({interval, times}, async () => {
        await generate({});

        await sendToChainAddress({address, lnd, tokens: member.tokens});
      });

      member.address = address;
    }

    // Collect the details of each member's UTXO
    for (const member of members) {
      const utxo = await asyncRetry({interval, times}, async () => {
        await generate({});

        const {utxos} = await getUtxos({lnd: member.lnd});

        const utxo = utxos.find(n => n.address === member.address);

        if (!utxo || !utxo.confirmation_count) {
          throw new Error('ExpectedConfirmedUtxoForMember');
        }

        return utxo;
      });

      // Have LND describe the UTXO to get its derivation path
      const described = await fundPsbt({
        inputs: [{
          transaction_id: utxo.transaction_id,
          transaction_vout: utxo.transaction_vout,
        }],
        lnd: member.lnd,
        outputs: [{
          address: (await createChainAddress({lnd: member.lnd})).address,
          tokens: utxo.tokens / 2,
        }],
      });

      for (const input of described.inputs) {
        await unlockUtxo({
          id: input.lock_id,
          lnd: member.lnd,
          transaction_id: input.transaction_id,
          transaction_vout: input.transaction_vout,
        });
      }

      const decoded = decodePsbt({psbt: described.psbt});

      const [input] = decoded.inputs;

      // Each member gets their change sent back to a P2WPKH address
      const change = await createChainAddress({
        format: 'p2wpkh',
        lnd: member.lnd,
      });

      const {program} = decodeBech32Address({address: change.address});

      member.bip32_derivations = input.bip32_derivations;
      member.change = '0014' + program.toString('hex');
      member.utxo = {
        non_witness_utxo: input.non_witness_utxo,
        transaction_id: utxo.transaction_id,
        transaction_vout: utxo.transaction_vout,
        witness_utxo: input.witness_utxo,
      };
    }

    const [first, second] = members;

    // Only the first member specifies the funding output, the cost is split
    const {psbt} = await assembleUnsignedPsbt({
      capacity,
      rate,
      proposed: [
        {
          change: first.change,
          funding: [fundingScript],
          utxos: [first.utxo],
        },
        {
          change: second.change,
          utxos: [second.utxo],
        },
      ],
    });

    const unsigned = decodePsbt({psbt});

    const tx = componentsOfTransaction({
      transaction: unsigned.unsigned_transaction,
    });

    // The inputs are the member UTXOs
    deepEqual(
      tx.inputs.map(asOutpoint).sort(),
      members.map(({utxo}) => {
        return `${utxo.transaction_id}:${utxo.transaction_vout}`;
      }).sort(),
      'The PSBT spends the member UTXOs'
    );

    // The outputs are the funding output and the change of each member
    deepEqual(
      tx.outputs.map(n => n.script).sort(),
      [fundingScript, first.change, second.change].sort(),
      'The PSBT pays to the funding output and to each member change'
    );

    const fundingOutput = tx.outputs.find(n => n.script === fundingScript);

    equal(fundingOutput.tokens, capacity, 'Funding output has the capacity');

    // Each member pays half of the capacity and a share of the fee
    members.forEach(member => {
      const out = tx.outputs.find(n => n.script === member.change);

      const fee = member.tokens - (capacity / 2) - out.tokens;

      equal(fee > 0, true, `The ${member.format} member pays a fee`);
    });

    // Each member signs their input
    const signed = [];

    for (const member of members) {
      const vin = tx.inputs.findIndex(input => {
        return input.id === member.utxo.transaction_id &&
          input.vout === member.utxo.transaction_vout;
      });

      // LND signs with the input sighash type, so set it for P2WPKH inputs
      const isP2wpkh = member.format === 'p2wpkh';

      // Add the member's derivation path to their input to allow signing
      const toSign = extendPsbt({
        psbt,
        inputs: tx.inputs.map((input, i) => {
          if (i !== vin) {
            return {};
          }

          return {
            bip32_derivations: member.bip32_derivations,
            sighash_type: isP2wpkh ? hashAll : hashDefault,
          };
        }),
      });

      const res = await partiallySignPsbt({
        lnd: member.lnd,
        psbt: toSign.psbt,
      });

      signed.push({vin, input: decodePsbt({psbt: res.psbt}).inputs[vin]});
    }

    // Add the member signatures to the unsigned PSBT
    const withSignatures = extendPsbt({
      psbt,
      inputs: tx.inputs.map((input, i) => {
        const {input: signature} = signed.find(n => n.vin === i);

        return {
          partial_sig: signature.partial_sig,
          taproot_key_spend_sig: signature.taproot_key_spend_sig,
        };
      }),
    });

    // Finalizing the PSBT checks the signatures on every input
    const {transaction} = extractTransaction({
      psbt: finalizePsbt({psbt: withSignatures.psbt}).psbt,
    });

    // The final transaction should pay at least the requested fee rate
    const spent = sumOf(unsigned.inputs.map(n => n.witness_utxo.tokens));
    const {vsize} = sizeOfTransaction({transaction});

    const fee = spent - sumOf(tx.outputs.map(n => n.tokens));

    equal(fee >= vsize * rate, true, 'Fee pays at least the fee rate');

    const {id} = idForTransaction({transaction});

    // Publish the transaction and mine it into a block
    const confirmed = await asyncRetry({interval, times}, async () => {
      await generate({});

      const {transactions} = await getChainTransactions({lnd});

      const confirmed = transactions.find(n => n.id === id);

      // Exit early when the transaction is confirmed
      if (!!confirmed && !!confirmed.is_confirmed) {
        return confirmed;
      }

      await broadcastChainTransaction({lnd, transaction});

      throw new Error('ExpectedAssembledTransactionConfirmedIntoABlock');
    });

    equal(confirmed.is_confirmed, true, 'Assembled transaction is confirmed');
  } catch (err) {
    deepEqual(err, null, 'Expected no error');
  } finally {
    await kill({});
  }

  return;
});
