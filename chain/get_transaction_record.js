const asyncAuto = require('async/auto');
const asyncMap = require('async/map');
const {getChainTransactions} = require('lightning/lnd_methods');
const {getChannels} = require('lightning/lnd_methods');
const {getClosedChannels} = require('lightning/lnd_methods');
const {getNode} = require('lightning/lnd_methods');
const {getPendingChannels} = require('lightning/lnd_methods');
const {returnResult} = require('asyncjs-util');
const {Transaction} = require('bitcoinjs-lib');

const transactionRecords = require('./transaction_records');

const {fromHex} = Transaction;
const uniq = arr => Array.from(new Set(arr));

/** Get LND internal record associated with a transaction id

  {
    [chain_transactions]: [{
      [block_id]: <Block Hash String>
      [confirmation_count]: <Confirmation Count Number>
      [confirmation_height]: <Confirmation Block Height Number>
      created_at: <Created ISO 8601 Date String>
      [description]: <Transaction Label String>
      [fee]: <Fees Paid Tokens Number>
      id: <Transaction Id String>
      is_confirmed: <Is Confirmed Bool>
      is_outgoing: <Transaction Outbound Bool>
      output_addresses: [<Address String>]
      tokens: <Tokens Including Fee Number>
      [transaction]: <Raw Transaction Hex String>
    }]
    [channels]: [{
      capacity: <Capacity Tokens Numberr>
      id: <Standard Format Short Channel Id Hex String>
      partner_public_key: <Peer Public Key Hex String>
      transaction_id: <Channel Transaction Id Hex String>
    }]
    [closed_channels]: [{
      capacity: <Closed Channel Capacity Tokens Number>
      [close_balance_spent_by]: <Channel Balance Output Spent By Tx Id String>
      [close_balance_vout]: <Channel Balance Close Tx Output Index Number>
      [close_confirm_height]: <Channel Close Confirmation Height Number>
      close_payments: [{
        is_outgoing: <Payment Is Outgoing Bool>
        is_paid: <Payment Is Claimed With Preimage Bool>
        is_pending: <Payment Resolution Is Pending Bool>
        is_refunded: <Payment Timed Out And Went Back To Payer Bool>
        [spent_by]: <Close Transaction Spent By Transaction Id Hex String>
        tokens: <Associated Tokens Number>
        transaction_id: <Transaction Id Hex String>
        transaction_vout: <Transaction Output Index Number>
      }]
      [close_transaction_id]: <Closing Transaction Id Hex String>
      final_local_balance: <Channel Close Final Local Balance Tokens Number>
      final_time_locked_balance: <Closed Channel Timelocked Tokens Number>
      [id]: <Closed Standard Format Channel Id String>
      is_breach_close: <Is Breach Close Bool>
      is_cooperative_close: <Is Cooperative Close Bool>
      is_funding_cancel: <Is Funding Cancelled Close Bool>
      is_local_force_close: <Is Local Force Close Bool>
      [is_partner_closed]: <Channel Was Closed By Channel Peer Bool>
      [is_partner_initiated]: <Channel Was Initiated By Channel Peer Bool>
      is_remote_force_close: <Is Remote Force Close Bool>
      partner_public_key: <Partner Public Key Hex String>
      transaction_id: <Channel Funding Transaction Id Hex String>
      transaction_vout: <Channel Funding Output Index Number>
    }]
    id: <Transaction Id Hex String>
    lnd: <Authenticated LND API Object>
    [pending_channels]: [{
      [close_transaction_id]: <Channel Closing Transaction Id String>
      is_active: <Channel Is Active Bool>
      is_closing: <Channel Is Closing Bool>
      is_opening: <Channel Is Opening Bool>
      is_partner_initiated: <Channel Partner Initiated Channel Bool>
      local_balance: <Channel Local Tokens Balance Number>
      local_reserve: <Channel Local Reserved Tokens Number>
      partner_public_key: <Channel Peer Public Key String>
      [pending_balance]: <Tokens Pending Recovery Number>
      [pending_payments]: [{
        is_incoming: <Payment Is Incoming Bool>
        timelock_height: <Payment Timelocked Until Height Number>
        tokens: <Payment Tokens Number>
        transaction_id: <Payment Transaction Id String>
        transaction_vout: <Payment Transaction Vout Number>
      }]
      received: <Tokens Received Number>
      [recovered_tokens]: <Tokens Recovered From Close Number>
      remote_balance: <Remote Tokens Balance Number>
      remote_reserve: <Channel Remote Reserved Tokens Number>
      sent: <Send Tokens Number>
      [timelock_expiration]: <Pending Tokens Block Height Timelock Number>
      [transaction_fee]: <Funding Transaction Fee Tokens Number>
      transaction_id: <Channel Funding Transaction Id String>
      transaction_vout: <Channel Funding Transaction Vout Number>
      [transaction_weight]: <Funding Transaction Weight Number>
    }]
  }

  @returns via cbk or Promise
  {
    [chain_fee]: <Paid Transaction Fee Tokens Number>
    [received]: <Received Tokens Number>
    related_channels: [{
      action: <Channel Action String>
      [balance]: <Channel Balance Tokens Number>
      [capacity]: <Channel Capacity Value Number>
      [channel]: <Channel Standard Format Id String>
      [close_tx]: <Channel Closing Transaction Id Hex String>
      [open_tx]: <Channel Opening Transaction id Hex String>
      [timelock]: <Channel Funds Timelocked Until Height Number>
      with: <Channel Peer Public Key Hex String>
    }]
    [sent]: <Sent Tokens Number>
    [sent_to]: [<Sent to Address String>]
    [tx]: <Transaction Id Hex String>
  }
*/
module.exports = (args, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: async () => {
        if (!args.id) {
          throw [400, 'ExpectedTransactionIdToFindRecordData'];
        }

        if (!args.lnd) {
          throw [400, 'ExpectedLndToFindChainTransactionRecordData'];
        }

        return;
      },

      // Get channels
      getChannels: ['validate', ({}, cbk) => {
        // Exit early when channels were provided
        if (!!args.channels) {
          return cbk(null, {channels: args.channels});
        }

        return getChannels({lnd: args.lnd}, cbk);
      }],

      // Get closed channels
      getClosed: ['validate', ({}, cbk) => {
        // Exit early when closed channels were provided
        if (!!args.closed_channels) {
          return cbk(null, {channels: args.closed_channels});
        }

        return getClosedChannels({lnd: args.lnd}, cbk);
      }],

      // Get pending transactions
      getPending: ['validate', ({}, cbk) => {
        if (!!args.pending_channels) {
          return cbk(null, {pending_channels: args.pending_channels});
        }

        return getPendingChannels({lnd: args.lnd}, cbk);
      }],

      // Get transactions
      getTx: ['validate', ({}, cbk) => {
        if (!!args.chain_transactions) {
          return cbk(null, {transactions: args.chain_transactions});
        }

        return getChainTransactions({lnd: args.lnd}, cbk);
      }],

      // Determine relationship of transaction id to records
      record: [
        'getChannels',
        'getClosed',
        'getPending',
        'getTx',
        async ({getChannels, getClosed, getPending, getTx}) =>
      {
        const records = [];
        const relatedChannels = [];

        const chans = getChannels.channels.filter(channel => {
          return channel.transaction_id === args.id;
        });

        const chanClosing = getClosed.channels.find(channel => {
          return channel.close_transaction_id === args.id;
        });

        const closingChans = getClosed.channels.filter(channel => {
          return channel.transaction_id === args.id;
        });

        const openingChans = getPending.pending_channels.filter(channel => {
          return channel.is_opening && channel.transaction_id === args.id;
        });

        const tx = getTx.transactions.find(transaction => {
          return transaction.id === args.id;
        });

        getClosed.channels.forEach(channel => {
          return channel.close_payments
            .filter(n => n.spent_by === args.id)
            .forEach(payment => {
              const direction = payment.is_outgoing ? 'outgoing' : 'incoming';

              if (!!payment.is_pending) {
                return records.push({
                  action: 'payment_pending',
                  channel: channel.id,
                  with: channel.partner_public_key,
                });
              }

              const resolution = payment.is_paid ? 'paid' : 'refunded';

              return records.push({
                action: `${direction}_payment_${resolution}`,
                channel: channel.id,
                with: channel.partner_public_key,
              });
            });
        });

        openingChans.forEach(channel => {
          return records.push({
            action: 'opening_channel',
            balance: channel.local_balance,
            open_tx: channel.transaction_id,
            with: channel.partner_public_key,
          });
        });

        if (!!closingChans.length) {
          closingChans.forEach(channel => {
            return records.push({
              action: 'opened_channel',
              capacity: channel.capacity,
              channel: channel.id,
              close_tx: channel.close_transaction_id,
              open_tx: channel.transaction_id,
              with: channel.partner_public_key,
            });
          });
        }

        if (!!chans.length) {
          chans.forEach(channel => {
            return records.push({
              action: 'opened_channel',
              capacity: channel.capacity,
              channel: channel.id,
              open_tx: channel.transaction_id,
              with: channel.partner_public_key,
            });
          });
        }

        if (!!chanClosing) {
          if (chanClosing.is_cooperative_close) {
            records.push({
              action: 'cooperatively_closed_channel',
              balance: chanClosing.final_local_balance,
              capacity: chanClosing.capacity || undefined,
              channel: chanClosing.id,
              close_tx: chanClosing.close_transaction_id,
              open_tx: chanClosing.transaction_id,
              with: chanClosing.partner_public_key,
            });
          }

          if (!!chanClosing.is_local_force_close) {
            records.push({
              action: 'force_closed_channel',
              balance: chanClosing.final_local_balance,
              capacity: chanClosing.capacity || undefined,
              channel: chanClosing.id,
              close_tx: chanClosing.close_transaction_id,
              open_tx: chanClosing.transaction_id,
              with: chanClosing.partner_public_key,
            });
          }

          if (!!chanClosing.is_remote_force_close) {
            records.push({
              action: 'peer_force_closed_channel',
              balance: chanClosing.final_local_balance,
              capacity: chanClosing.capacity || undefined,
              channel: chanClosing.id,
              close_tx: chanClosing.close_transaction_id,
              open_tx: chanClosing.transaction_id,
              with: chanClosing.partner_public_key,
            });
          }
        }

        if (!!closingChans.length) {
          closingChans.forEach(closing => {
            if (!!closing.is_remote_force_close) {
              records.push({
                action: 'peer_force_closed_channel',
                balance: closing.final_local_balance,
                capacity: closing.capacity,
                channel: closing.id,
                close_tx: closing.close_transaction_id,
                open_tx: closing.transaction_id,
                with: closing.partner_public_key,
              });
            }
          });
        }

        if (!!tx && !!tx.transaction) {
          fromHex(tx.transaction).ins.forEach(({hash, index}) => {
            const txRecords = transactionRecords({
              ended: getClosed.channels,
              id: hash.reverse().toString('hex'),
              original: args.id,
              pending: getPending.pending_channels,
              txs: getTx.transactions,
              vout: index,
            });

            txRecords.records.forEach(record => records.push(record));
          });
        }

        records.forEach(record => {
          const {action} = record;
          const {channel} = record;

          const existing = relatedChannels
            .filter(() => !!channel)
            .find(n => n.action === action && n.channel === channel);

          // Exit early when this related channel action already exists
          if (!!existing) {
            return;
          }

          return relatedChannels.push({
            action,
            balance: record.balance || undefined,
            capacity: record.capacity || undefined,
            channel: record.channel || undefined,
            close_tx: record.close_tx || undefined,
            open_tx: record.open_tx || undefined,
            timelock: record.timelock || undefined,
            with: record.with,
          });
        });

        const hasFee = !!tx && !!tx.fee;
        const isIncoming = !!tx && !tx.is_outgoing && !!tx.tokens;

        return {
          chain_fee: hasFee ? tx.fee : undefined,
          received: isIncoming ? tx.tokens : undefined,
          related_channels: relatedChannels,
          sent: !records.length && !!tx ? tx.tokens : undefined,
          sent_to: !records.length && !!tx ? tx.output_addresses : undefined,
          tx: !!tx ? tx.id : undefined,
        };
      }],

      // Record details
      details: ['record', ({record}, cbk) => {
        const keys = uniq(record.related_channels.map(n => n.with));

        return asyncMap(keys, (key, cbk) => {
          return getNode({
            is_omitting_channels: true,
            lnd: args.lnd,
            public_key: key,
          },
          (err, res) => {
            // Ignore errors
            if (!!err || !res.alias) {
              return cbk();
            }

            return cbk(null, {alias: res.alias, public_key: key});
          });
        },
        (err, nodes) => {
          if (!!err) {
            return cbk(err);
          }

          const relatedWithAlias = record.related_channels.map(related => {
            const node = nodes.find(n => !!n && n.public_key === related.with);

            related.node = !!node && !!node.alias ? node.alias : undefined;

            return related;
          });

          return cbk(null, {
            chain_fee: record.chain_fee,
            received: record.received,
            related_channels: relatedWithAlias,
            sent: record.sent,
            sent_to: record.sent_to,
            tx: record.tx,
          });
        });
      }],
    },
    returnResult({reject, resolve, of: 'details'}, cbk));
  });
};
