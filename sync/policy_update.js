const changesToRecord = require('./changes_to_record');

/** Policy update

  {
    channel: {
      id: <Standard Format Channel Id String>
      policies: [{
        [base_fee_mtokens]: <Base Fee Millitokens String>
        [cltv_delta]: <Locktime Delta Number>
        [fee_rate]: <Fees Charged in Millitokens Per Million Number>
        [is_disabled]: <Channel Is Disabled Bool>
        [max_htlc_mtokens]: <Maximum HTLC Millitokens Value String>
        [min_htlc_mtokens]: <Minimum HTLC Millitokens Value String>
        public_key: <Node Public Key Hex String>
        [updated_at]: <Edge Last Updated At ISO 8601 Date String>
      }]
    }
    public_key: <Policy Author Public Key Hex String>
    record: {
      _rev: <Record Revision Number>
      base_fee_mtokens: <Channel Base Fee Millitokens String>
      cltv_delta: <Channel CLTV Delta Number>
      fee_rate: <Channel Feel Rate In Millitokens Per Million Number>
      id: <Standard Format Channel Id String>
      is_disabled: <Channel Is Disabled Bool>
      [max_htlc_mtokens]: <Channel Maximum HTLC Millitokens String>
      min_htlc_mtokens: <Channel Minimum HTLC Millitokens String>
      public_key: <Public Key Buffer>
      updated_at: <Update Received At ISO 8601 Date String>
    }
  }

  @returns
  {
    [changes]: {
      _rev: {
        add: <Record Increment Number>
      }
      [base_fee_mtokens]: {
        set: <Channel Base Fee Millitokens String>
      }
      [cltv_delta]: {
        set: <Channel CLTV Delta Number>
      }
      [fee_rate]: {
        set: <Channel Feel Rate In Millitokens Per Million Number>
      }
      [is_disabled]: {
        set: <Channel Is Disabled Bool>
      }
      [max_htlc_mtokens]: {
        set: <Channel Maximum HTLC Millitokens String>
      }
      [min_htlc_mtokens]: {
        set: <Channel Minimum HTLC Millitokens String>
      }
      [updated_at]: {
        set: <Update Received At ISO 8601 Date String>
      }
    }
    [previous]: {
      [base_fee_mtokens]: <Channel Base Fee Millitokens String>
      [cltv_delta]: <Channel CLTV Delta Number>
      [fee_rate]: <Channel Feel Rate In Millitokens Per Million Number>
      [is_disabled]: <Channel Is Disabled Bool>
      [max_htlc_mtokens]: <Channel Maximum HTLC Millitokens String>
      [min_htlc_mtokens]: <Channel Minimum HTLC Millitokens String>
      [updated_at]: <Update Received At ISO 8601 Date String>
    }
    [updates]: {
      [base_fee_mtokens]: <Channel Base Fee Millitokens String>
      [cltv_delta]: <Channel CLTV Delta Number>
      [fee_rate]: <Channel Feel Rate In Millitokens Per Million Number>
      [is_disabled]: <Channel Is Disabled Bool>
      [max_htlc_mtokens]: <Channel Maximum HTLC Millitokens String>
      [min_htlc_mtokens]: <Channel Minimum HTLC Millitokens String>
      [updated_at]: <Update Received At ISO 8601 Date String>
    }
  }
*/
module.exports = args => {
  if (!args.channel) {
    throw new Error('ExpectedChannelToDerivePolicyUpdate');
  }

  if (!args.public_key) {
    throw new Error('ExpectedPublicKeyToDerivePolicyUpdate');
  }

  if (!args.record) {
    throw new Error('ExpectedRecordToDerivePolicyUpdate');
  }

  const policy = args.channel.policies.find(policy => {
    return policy.public_key === args.public_key;
  });

  // Exit early when there is no policy update
  if (!policy.updated_at) {
    return {};
  }

  return changesToRecord({
    record: {
      base_fee_mtokens: args.record.base_fee_mtokens,
      cltv_delta: args.record.cltv_delta,
      fee_rate: args.record.fee_rate,
      is_disabled: args.record.is_disabled,
      max_htlc_mtokens: args.record.max_htlc_mtokens,
      min_htlc_mtokens: args.record.min_htlc_mtokens,
      updated_at: args.record.updated_at,
    },
    updated: {
      base_fee_mtokens: policy.base_fee_mtokens,
      cltv_delta: policy.cltv_delta,
      fee_rate: policy.fee_rate,
      is_disabled: policy.is_disabled,
      max_htlc_mtokens: policy.max_htlc_mtokens,
      min_htlc_mtokens: policy.min_htlc_mtokens,
      updated_at: policy.updated_at,
    },
  });
};
