const {updateForwardHtlc} = require('./../sync');

/** Event forward HTLC

  {
    at: <Updated At ISO 8601 Date String>
    db: <Database Object>
    [cltv_delta]: <CLTV Delta Number>
    [external_failure]: <External Failure String>
    [fee_mtokens]: <Fee Millitokens String>
    in_channel: <Inbound Channel Id String>
    in_payment: <Inbound Channel Payment Number>
    internal_failure: <Internal Failure String>
    is_confirmed: <HTLC Forward Is Successful Bool>
    is_failed: <HTLC Forward Is Failed Bool>
    [mtokens]: <HTLC Millitokens String>
    out_channel: <Outbound Channel Id String>
    out_payment: <Outbound Channel Payment Number>
    public_key: <Public Key Hex String>
    [timeout]: <Forward CLTV Timeout Height Number>
  }
*/
module.exports = async (args) => {
  const synced = await updateForwardHtlc({
    at: args.at,
    db: args.db,
    cltv_delta: args.cltv_delta,
    external_failure: args.external_failure,
    fee_mtokens: args.fee_mtokens,
    in_channel: args.in_channel,
    in_payment: args.in_payment,
    internal_failure: args.internal_failure,
    is_confirmed: args.is_confirmed,
    is_failed: args.is_failed,
    mtokens: args.mtokens,
    out_channel: args.out_channel,
    out_payment: args.out_payment,
    public_key: args.public_key,
    timeout: args.timeout,
  });

  const isInFlight = !args.is_confirmed && !args.is_failed;

  // New forward in flight
  if (!!synced.created && !!isInFlight) {
    return args.emitter.emit('forwarding', {
      cltv_delta: args.cltv_delta,
      external_failure: args.external_failure,
      fee_mtokens: args.fee_mtokens,
      in_channel: args.in_channel,
      in_payment: args.in_payment,
      internal_failure: args.internal_failure,
      is_confirmed: args.is_confirmed,
      is_failed: args.is_failed,
      mtokens: args.mtokens,
      out_channel: args.out_channel,
      out_payment: args.out_payment,
      public_key: args.public_key,
      timeout: args.timeout,
      updated_at: args.at,
    });
  }

  // Forward succeeded
  if (!!synced.updates && !!synced.updates.is_confirmed) {
    return args.emitter.emit('forwarded_payment', {
      fee_mtokens: synced.original.fee_mtokens,
      in_channel: args.in_channel,
      mtokens: synced.original.mtokens,
      out_channel: args.out_channel,
      public_key: args.public_key,
    });
  }

  // Forward failed
  if (!!synced.updates && !!synced.updates.is_failed) {
    return args.emitter.emit('failed_forward', {
      external_failure: args.external_failure,
      in_channel: args.in_channel,
      internal_failure: args.internal_failure,
      mtokens: synced.original.mtokens,
      out_channel: args.out_channel,
      public_key: args.public_key,
    });
  }

  return;
};
