const {deepEqual} = require('node:assert').strict;
const {setImmediate} = require('node:timers/promises');
const test = require('node:test');

const method = require('./../../monitor/subscribe_to_pending_channels');

const defaultDelayMs = 1000 * 60;
const makeTxId = n => Buffer.alloc(32, n).toString('hex');
const partner = Buffer.alloc(33, 2).toString('hex');
const polls = [1, 2, 3];

const makeChannel = n => ({
  capacity: '1',
  channel_point: `${makeTxId(n)}:0`,
  local_balance: '1',
  local_chan_reserve_sat: '1',
  remote_balance: '1',
  remote_chan_reserve_sat: '1',
  remote_node_pub: partner,
});

const makeResponse = ({closing, opening}) => ({
  pending_force_closing_channels: [],
  pending_open_channels: opening.map(n => ({
    channel: makeChannel(n),
    commit_fee: '1',
    commit_weight: '1',
    confirmation_height: 0,
    fee_per_kw: '1',
  })),
  waiting_close_channels: closing.map(n => ({
    channel: makeChannel(n),
    limbo_balance: '1',
  })),
});

const makeExpected = ({is_closing, n}) => ({
  blocks_until_expiry: undefined,
  capacity: 1,
  close_transaction: undefined,
  close_transaction_id: undefined,
  description: undefined,
  is_active: false,
  is_closing,
  is_opening: !is_closing,
  is_partner_initiated: false,
  is_private: undefined,
  is_timelocked: false,
  local_balance: 1,
  local_reserve: 1,
  opening_funding_height: undefined,
  opening_waiting_blocks: undefined,
  partner_public_key: partner,
  pending_balance: is_closing ? 1 : undefined,
  pending_payments: undefined,
  received: 0,
  recovered_tokens: undefined,
  remote_balance: 1,
  remote_reserve: 1,
  sent: 0,
  timelock_blocks: undefined,
  timelock_expiration: undefined,
  transaction_fee: is_closing ? null : 1,
  transaction_id: makeTxId(n),
  transaction_vout: 0,
  transaction_weight: is_closing ? null : 1,
  type: undefined,
});

const makeLnd = ({responses}) => {
  let call = 0;

  return {
    default: {
      pendingChannels: ({}, cbk) => {
        const res = responses[call++] || responses[responses.length - 1];

        // Exit early when getting pending channels should fail
        if (res === 'error') {
          return cbk('err');
        }

        return cbk(null, makeResponse(res));
      },
    },
  };
};

const tests = [
  {
    args: {
      lnd: makeLnd({
        responses: [
          {closing: [1], opening: [2]},
          {closing: [1, 3], opening: [2, 4]},
          'error',
        ],
      }),
    },
    description: 'New pending channels are emitted',
    expected: [
      {closing: {channels: [makeExpected({is_closing: true, n: 3})]}},
      {opening: {channels: [makeExpected({is_closing: false, n: 4})]}},
      {error: [503, 'UnexpectedPendingChannelsErr', {err: 'err'}]},
    ],
    listen: ['closing', 'error', 'opening'],
  },
  {
    args: {
      delay: defaultDelayMs,
      lnd: makeLnd({
        responses: [
          {closing: [1], opening: [2]},
          {closing: [1], opening: [2]},
          {closing: [], opening: []},
        ],
      }),
    },
    description: 'Existing pending channels are not emitted',
    expected: [],
    listen: ['closing', 'error', 'opening'],
  },
  {
    args: {lnd: makeLnd({responses: ['error']})},
    description: 'Errors are not emitted when there is no error listener',
    expected: [],
    listen: ['opening'],
  },
  {
    args: {lnd: makeLnd({responses: [{closing: [1], opening: [2]}]})},
    description: 'Polling stops when there are no listeners',
    expected: [],
    listen: [],
  },
];

tests.forEach(({args, description, expected, listen}) => {
  return test(description, async ({mock}) => {
    const events = [];

    mock.timers.enable({apis: ['setTimeout']});

    const sub = method(args);

    listen.forEach(event => sub.on(event, n => events.push({[event]: n})));

    // Poll for pending channels until the responses have been checked
    for (const poll of polls) {
      await setImmediate();

      mock.timers.tick(defaultDelayMs);
    }

    sub.removeAllListeners();

    deepEqual(events, expected, 'Got expected events');

    return;
  });
});
