const {test} = require('@alexbosworth/tap');

const {chanInfoResponse} = require('./../fixtures');
const {pendingChannelsResponse} = require('./../fixtures');
const updateChannelFee = require('./../../peers/update_channel_fee');

const makeLnd = overrides => {
  return {
    default: {
      getChanInfo: ({}, cbk) => {
        return cbk(null, overrides.chanInfoResponse || chanInfoResponse);
      },
      listChannels: ({}, cbk) => {
        if (overrides.channelsResponse) {
          return cbk(null, overrides.channelsResponse);
        }

        return cbk(null, {
          channels: [{
            active: true,
            capacity: '1',
            chan_id: '1',
            chan_status_flags: '1',
            channel_point: `${Buffer.alloc(32).toString('hex')}:0`,
            commit_fee: '1',
            commit_weight: '1',
            commitment_type: 'LEGACY',
            csv_delay: '1',
            fee_per_kw: '1',
            initiator: true,
            lifetime: '1',
            local_balance: '1',
            local_chan_reserve_sat: '1',
            local_constraints: {
              chan_reserve_sat: '1',
              csv_delay: 1,
              dust_limit_sat: '1',
              max_accepted_htlcs: 1,
              max_pending_amt_msat: '1',
              min_htlc_msat: '1',
            },
            num_updates: '1',
            pending_htlcs: [],
            private: false,
            remote_balance: '1',
            remote_chan_reserve_sat: '1',
            remote_constraints: {
              chan_reserve_sat: '1',
              csv_delay: 1,
              dust_limit_sat: '1',
              max_accepted_htlcs: 1,
              max_pending_amt_msat: '1',
              min_htlc_msat: '1',
            },
            remote_pubkey: Buffer.alloc(33).toString('hex'),
            static_remote_key: true,
            thaw_height: 0,
            total_satoshis_received: '1',
            total_satoshis_sent: '1',
            unsettled_balance: '1',
            uptime: '1',
          }],
        });
      },
      pendingChannels: ({}, cbk) => {
        return cbk(
          null,
          overrides.pendingChannelsResponse || pendingChannelsResponse
        );
      },
      updateChannelPolicy: ({}, cbk) => cbk(null, {failed_updates: []}),
    },
  };
};

const makeArgs = overrides => {
  const args = {
    base_fee_mtokens: '1',
    cltv_delta: 1,
    fee_rate: 1,
    from: Buffer.alloc(33).toString('hex'),
    lnd: makeLnd({}),
    transaction_id: Buffer.alloc(32).toString('hex'),
    transaction_vout: 0,
  };

  Object.keys(overrides).forEach(key => args[key] = overrides[key]);

  return args;
};

const tests = [
  {
    args: makeArgs({fee_rate: undefined}),
    description: 'The fee rate must be defined',
    error: [400, 'ExpectedFeeRateToUpdateChannelFee'],
  },
  {
    args: makeArgs({from: undefined}),
    description: 'The from key must be defined',
    error: [400, 'ExpectedFromPublicKeyToUpdateChannelFee'],
  },
  {
    args: makeArgs({lnd: undefined}),
    description: 'The lnd object must be defined',
    error: [400, 'ExpectedLndToUpdateChannelFee'],
  },
  {
    args: makeArgs({transaction_id: undefined}),
    description: 'The channel tx id must be defined',
    error: [400, 'ExpectedTransactionIdToUpdateChannelFee'],
  },
  {
    args: makeArgs({transaction_vout: undefined}),
    description: 'The channel tx vout must be defined',
    error: [400, 'ExpectedTransactionVoutToUpdateChannelFee'],
  },
  {
    args: makeArgs({
      lnd: makeLnd({
        chanInfoResponse: {
          capacity: '1',
          chan_point: '1:1',
          channel_id: '1',
          node1_pub: '000000000000000000000000000000000000000000000000000000000000000000',
          node2_pub: '010000000000000000000000000000000000000000000000000000000000000000',
        },
      }),
    }),
    description: 'Fee rate update expects updated fee',
    error: [404, 'UnexpectedMissingBaseFeeMtokensUpdatingChanFee'],
  },
  {
    args: makeArgs({lnd: makeLnd({channelsResponse: {channels: []}})}),
    description: 'Fee rate update expects channel',
    error: [404, 'ExpectedKnownChannelToUpdateChannelFee'],
  },
  {
    args: makeArgs({
      lnd: makeLnd({
        pendingChannelsResponse: {
          pending_closing_channels: [],
          pending_force_closing_channels: [],
          pending_open_channels: [{
            channel: {
              capacity: '1',
              channel_point: `${Buffer.alloc(32).toString('hex')}:0`,
              local_balance: '1',
              local_chan_reserve_sat: '1',
              remote_balance: '1',
              remote_chan_reserve_sat: '1',
              remote_node_pub: '000000000000000000000000000000000000000000000000000000000000000000',
            },
            commit_fee: '1',
            commit_weight: "1",
            confirmation_height: 1,
            fee_per_kw: '1',
          }],
          total_limbo_balance: '1',
          waiting_close_channels: [],
        },
      }),
    }),
    description: 'Fee rate update expects confirmed channel',
    error: [503, 'ChannelToSetFeeRateForIsStillPending'],
  },
  {
    args: makeArgs({}),
    description: 'Fee rate is updated',
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async ({end, equal, rejects}) => {
    if (!!error) {
      await rejects(updateChannelFee(args), error, 'Got expected error');
    } else {
      await updateChannelFee(args);
    }

    return end();
  });
});
