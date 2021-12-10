const asyncAuto = require('async/auto');
const asyncRetry = require('async/retry');
const {getPendingChannels} = require('lightning');
const {returnResult} = require('asyncjs-util');

/** Wait for an incoming pending open channel matching specific criteria

  {
    [capacity]: <Channel Capacity Tokens Number>
    interval: <Check Time Milliseconds Number>
    lnd: <Authenticated LND API Object>
    local_balance: <Starting Local Balance Number>
    partner_public_key: <Peer Public Key Hex String>
    times: <Total Check Times Number>
    transaction_id: <Transaction Id Hex String>
    transaction_vout: <Transaction Output Index Number>
  }

  @returns via cbk or Promise
  {
    transaction_id: <Transaction Id Hex String>
    transaction_vout: <Transaction Output Index Number>
  }
*/
module.exports = (args, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!args.interval) {
          return cbk([400, 'ExpectedCheckingTimeIntervalToWaitForOpen']);
        }

        if (!args.lnd) {
          return cbk([400, 'ExpectedLndToWaitForChannelOpenProposal']);
        }

        if (args.local_balance === undefined) {
          return cbk([400, 'ExpectedLocalBalanceToWaitFor'])
        }

        return cbk();
      },

      // Wait for an incoming pending channel open
      wait: ['validate', ({}, cbk) => {
        return asyncRetry({
          interval: args.interval,
          times: args.times,
        },
        cbk => {
          return getPendingChannels({lnd: args.lnd}, (err, res) => {
            if (!!err) {
              return cbk(err);
            }

            // Look for the incoming channel proposal
            const pending = res.pending_channels.find(channel => {
              if (!!args.capacity && channel.capacity !== args.capacity) {
                return false;
              }

              if (channel.transaction_vout !== args.transaction_vout) {
                return false;
              }

              if (!channel.is_opening) {
                return false;
              }

              if (channel.local_balance !== args.local_balance) {
                return false;
              }

              if (channel.partner_public_key !== args.partner_public_key) {
                return false;
              }

              return channel.transaction_id === args.transaction_id;
            });

            if (!pending) {
              return cbk([503, 'ExpectedIncomingPendingChannel']);
            }

            return cbk(null, {
              transaction_id: pending.transaction_id,
              transaction_vout: pending.transaction_vout,
            });
          });
        },
        cbk);
      }],
    },
    returnResult({reject, resolve, of: 'wait'}, cbk));
  });
};
