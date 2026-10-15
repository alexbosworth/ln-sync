const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const waitForPendingOpen = require('./../../peers/wait_for_pending_open');

const otherKey = Buffer.alloc(33, 3).toString('hex');
const otherTxId = Buffer.alloc(32, 1).toString('hex');
const otherTxId2 = Buffer.alloc(32, 2).toString('hex');
const partner = Buffer.alloc(33, 2).toString('hex');
const txId = Buffer.alloc(32).toString('hex');

const makeChannel = overrides => {
  const channel = {
    capacity: '1',
    channel_point: `${txId}:0`,
    local_balance: '1',
    local_chan_reserve_sat: '1',
    remote_balance: '1',
    remote_chan_reserve_sat: '1',
    remote_node_pub: partner,
  };

  Object.keys(overrides).forEach(k => channel[k] = overrides[k]);

  return channel;
};

const makeOpening = overrides => ({
  channel: makeChannel(overrides),
  commit_fee: '1',
  commit_weight: '1',
  confirmation_height: 0,
  fee_per_kw: '1',
});

const makeLnd = ({closing, err, opening}) => {
  return {
    default: {
      pendingChannels: ({}, cbk) => {
        // Exit early when getting pending channels should fail
        if (!!err) {
          return cbk(err);
        }

        return cbk(null, {
          pending_force_closing_channels: [],
          pending_open_channels: opening,
          total_limbo_balance: '0',
          waiting_close_channels: (closing || []).map(overrides => ({
            channel: makeChannel(overrides),
            limbo_balance: '1',
          })),
        });
      },
    },
  };
};

const makeArgs = overrides => {
  const args = {
    capacity: 1,
    interval: 1,
    lnd: makeLnd({
      closing: [{channel_point: `${otherTxId}:0`}],
      opening: [
        makeOpening({capacity: '2'}),
        makeOpening({channel_point: `${txId}:1`}),
        makeOpening({local_balance: '2'}),
        makeOpening({remote_node_pub: otherKey}),
        makeOpening({channel_point: `${otherTxId2}:0`}),
        makeOpening({}),
      ],
    }),
    local_balance: 1,
    partner_public_key: partner,
    times: 2,
    transaction_id: txId,
    transaction_vout: 0,
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const tests = [
  {
    args: makeArgs({interval: undefined}),
    description: 'A check interval is required to wait for a pending open',
    error: [400, 'ExpectedCheckingTimeIntervalToWaitForOpen'],
  },
  {
    args: makeArgs({lnd: undefined}),
    description: 'An lnd object is required to wait for a pending open',
    error: [400, 'ExpectedLndToWaitForChannelOpenProposal'],
  },
  {
    args: makeArgs({local_balance: undefined}),
    description: 'A local balance is required to wait for a pending open',
    error: [400, 'ExpectedLocalBalanceToWaitFor'],
  },
  {
    args: makeArgs({lnd: makeLnd({err: 'err'})}),
    description: 'A failure to get pending channels returns an error',
    error: [503, 'UnexpectedPendingChannelsErr', {err: 'err'}],
  },
  {
    args: makeArgs({lnd: makeLnd({opening: []})}),
    description: 'A pending channel that never shows up returns an error',
    error: [503, 'ExpectedIncomingPendingChannel'],
  },
  {
    args: makeArgs({lnd: makeLnd({closing: [{}], opening: []})}),
    description: 'A matching pending closing channel is not returned',
    error: [503, 'ExpectedIncomingPendingChannel'],
  },
  {
    args: makeArgs({}),
    description: 'A matching pending open channel is returned',
    expected: {transaction_id: txId, transaction_vout: 0},
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    if (!!error) {
      await rejects(waitForPendingOpen(args), error, 'Got expected error');
    } else {
      deepEqual(await waitForPendingOpen(args), expected, 'Got result');
    }

    return;
  });
});
