const asyncRetry = require('async/retry');

const emitError = require('./emit_error');
const {updateReceiveHtlc} = require('./../sync');

const interval = 1e3;
const times = 1e3;

/** Received HTLC event

  {
    at: <Event At ISO 8601 Date String>
    db: <Database Object>
    emitter: <EventEmitter Object>
    [external_failure]: <External Failure Reason String>
    in_channel: <Payment In Channel Id String>
    in_payment: <In Payment Channel Index Number>
    [internal_failure]: <Internal Failure Reason String>
    is_confirmed: <HTLC Is Confirmed Bool>
    is_failed: <HTLC Is Failed Bool>
    public_key: <Received On Node With Public Key Hex String>
  }
*/
module.exports = async args => {
  return await asyncRetry({interval, times}, async () => {
    const synced = await updateReceiveHtlc({
      at: args.at,
      db: args.db,
      external_failure: args.external_failure,
      in_channel: args.in_channel,
      in_payment: args.in_payment,
      internal_failure: args.internal_failure,
      is_confirmed: args.is_confirmed,
      is_failed: args.is_failed,
      public_key: args.public_key,
    });

    // New successful HTLC receive
    if (!!synced.created && !!synced.created.is_confirmed) {
      return args.emitter.emit('received_htlc', {
        in_channel: args.in_channel,
        internal_failure: args.internal_failure,
        public_key: args.public_key,
      });
    }

    // New failed HTLC receive
    if (!!synced.created && !!synced.created.is_failed) {
      return args.emitter.emit('rejected_payment', {
        in_channel: args.in_channel,
        internal_failure: args.internal_failure,
        public_key: args.public_key,
      });
    }

    return;
  });
};
