const bufferFromHex = hex => Buffer.from(hex, 'hex');
const createRecordRev = 0;

/** Policy record creation

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
        public_key: <Node Public Key String>
        [updated_at]: <Edge Last Updated At ISO 8601 Date String>
      }]
    }
    public_key: <Public Key Hex String>
  }

  @returns
  {
    [record]: {
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
*/
module.exports = args => {
  if (!args.channel) {
    throw new Error('ExpectedChannelToDerivePolicyRecord');
  }

  if (!args.public_key) {
    throw new Error('ExpectedPublicKeyToDerivePolicyRecord');
  }

  const policy = args.channel.policies.find(policy => {
    return policy.public_key === args.public_key;
  });

  if (!policy) {
    throw new Error('FailedToFindPolicyForPolicyRecord');
  }

  // Exit early when the policy has no active info
  if (!policy.updated_at || policy.is_disabled === undefined) {
    return {};
  }

  return {
    record: {
      _rev: createRecordRev,
      base_fee_mtokens: policy.base_fee_mtokens,
      cltv_delta: policy.cltv_delta,
      fee_rate: policy.fee_rate,
      id: args.channel.id,
      is_disabled: policy.is_disabled,
      max_htlc_mtokens: policy.max_htlc_mtokens,
      min_htlc_mtokens: policy.min_htlc_mtokens,
      public_key: bufferFromHex(args.public_key),
      updated_at: policy.updated_at,
    },
  };
};
