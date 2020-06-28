const asyncRetry = require('async/retry');

const emitError = require('./emit_error');
const {updatePaymentHtlc} = require('./../sync');

const interval = 200;
const times = 1e3;

/** Payment event HTLC

  {
    at: <Payment Update At ISO 8601 Date String>
    db: <Database Object>
    emitter: <EventEmitter Object>
    is_confirmed: <HTLC is Confirmed Bool>
    is_failed: <HTLC is Failed Bool>
    [mtokens]: <HTLC Millitokens String>
    out_channel: <HTLC Out Channel Id String>
    out_payment: <HTLC Out Channel Index Number>
    public_key: <Node Public Key Hex String>
    [timeout]: <HTLC Timeout CLTV Height Number>
  }

  @returns via Promise
*/
module.exports = async args => {
  return await asyncRetry({interval, times}, async () => {
    const synced = await updatePaymentHtlc({
      at: args.at,
      db: args.db,
      is_confirmed: args.is_confirmed,
      is_failed: args.is_failed,
      mtokens: args.mtokens,
      out_channel: args.out_channel,
      out_payment: args.out_payment,
      public_key: args.public_key,
      timeout: args.timeout,
    });

    if (!!synced.created && !!args.mtokens) {
      return args.emitter.emit('attempting_payment', {
        out_channel: args.out_channel,
        mtokens: args.mtokens,
        public_key: args.public_key,
      });
    }

    if (!!synced.updates && !!synced.updates.is_confirmed) {
      return args.emitter.emit('attempt_payment_sent', {
        out_channel: args.out_channel,
        mtokens: synced.original.mtokens,
        public_key: args.public_key,
      });
    }

    if (!!synced.updates && !!synced.updates.is_failed) {
      return args.emitter.emit('attempt_payment_failed', {
        out_channel: args.out_channel,
        mtokens: synced.original.mtokens,
        public_key: args.public_key,
      });
    }

    return;
  });
};
