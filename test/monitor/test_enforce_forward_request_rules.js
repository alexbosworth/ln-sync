const EventEmitter = require('node:events');
const {deepEqual} = require('node:assert').strict;
const {setTimeout: delay} = require('node:timers/promises');
const {encodeChanId} = require('bolt07');
const test = require('node:test');
const {throws} = require('node:assert').strict;

const {chanInfoResponse} = require('./../fixtures');
const enforceRules = require('./../../monitor/enforce_forward_request_rules');
const {getInfoResponse} = require('./../fixtures');

const makeKey = n => Buffer.alloc(33, n).toString('hex');
const makeChannel = height => encodeChanId({
  block_height: height,
  block_index: 1,
  output_index: 0,
});
const nowNs = () => (BigInt(Date.now()) * BigInt(1e6)).toString();

const alice = makeKey(3);
const bob = makeKey(4);
const carol = makeKey(5);
const me = makeKey(2);

// Inbound channels with Alice
const in1 = makeChannel(100);
const in2 = makeChannel(101);

// Outbound channels with Bob and Carol
const out1 = makeChannel(102);
const out2 = makeChannel(103);
const out3 = makeChannel(104);
const out4 = makeChannel(105);

// A channel that cannot be found in the graph
const unknown = makeChannel(106);

// The node keys of each channel, in the order they appear in the graph
const channelKeys = {
  [in1.number]: [alice, me],
  [in2.number]: [me, alice],
  [out1.number]: [me, bob],
  [out2.number]: [bob, me],
  [out3.number]: [me, bob],
  [out4.number]: [me, carol],
};

const makeForwardRequest = ([inbound, outbound]) => ({
  custom_records: {},
  incoming_amount_msat: '2000',
  incoming_circuit_key: {chan_id: inbound.number, htlc_id: '0'},
  incoming_expiry: 200,
  outgoing_amount_msat: '1000',
  outgoing_expiry: 100,
  outgoing_requested_chan_id: outbound.number,
  payment_hash: Buffer.alloc(32),
});

const makeHtlcEvent = ({id, out, type}) => ({
  event_type: type === 'settle' ? 'FORWARD' : type,
  forward_event: type === 'settle' ? undefined : {
    info: {
      incoming_amt_msat: '2000',
      incoming_timelock: 200,
      outgoing_amt_msat: '1000',
      outgoing_timelock: 100,
    },
  },
  incoming_channel_id: in1.number,
  incoming_htlc_id: id,
  outgoing_channel_id: out1.number,
  outgoing_htlc_id: out || id,
  settle_event: type === 'settle' ? {preimage: Buffer.alloc(32)} : undefined,
  timestamp_ns: nowNs(),
});

const makeSubscription = ({delay, emit}) => {
  const sub = new EventEmitter();

  sub.cancel = () => {};
  sub.write = ({}) => {};

  emit.forEach((data, i) => {
    return setTimeout(() => {
      // Exit early when the subscription should emit an error
      if (data === 'error') {
        return sub.emit('error', 'err');
      }

      return sub.emit('data', data);
    },
    delay + i * 5);
  });

  return sub;
};

const makeLnd = overrides => {
  return {
    chain: {
      registerBlockEpochNtfn: ({}) => makeSubscription({
        delay: 1,
        emit: (overrides.blocks || []).map(height => {
          return height === 'error' ? height : {hash: Buffer.alloc(32), height};
        }),
      }),
    },
    default: {
      getChanInfo: ({chan_id}, cbk) => {
        // Exit early when the channel is not known
        if (!channelKeys[chan_id]) {
          return cbk('err');
        }

        const [node1, node2] = channelKeys[chan_id];

        return cbk(null, {
          ...chanInfoResponse,
          channel_id: chan_id,
          node1_pub: node1,
          node2_pub: node2,
        });
      },
      getInfo: ({}, cbk) => {
        // Exit early when getting the wallet info should fail
        if (!!overrides.is_info_failing) {
          return cbk('err');
        }

        return cbk(null, getInfoResponse);
      },
    },
    router: {
      htlcInterceptor: ({}) => makeSubscription({
        delay: 50,
        emit: (overrides.requests || [[in1, out1]]).map(n => {
          return n === 'error' ? n : makeForwardRequest(n);
        }),
      }),
      subscribeHtlcEvents: ({}) => makeSubscription({
        delay: 1,
        emit: (overrides.htlcs || []).map(n => {
          return n === 'error' ? n : makeHtlcEvent(n);
        }),
      }),
    },
  };
};

const makeArgs = overrides => {
  const args = {lnd: makeLnd({})};

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const rejected = ([inbound, outbound], reason) => ({
  rejected: {
    in_channel: inbound.channel,
    out_channel: outbound.channel,
    reject_reason: reason,
  },
});

const pair = {inbound_peer: alice, outbound_peer: bob};

const pendingHtlcs = [
  {id: '1', type: 'SEND'},
  {id: '1', type: 'RECEIVE'},
  {id: '0', out: '3', type: 'FORWARD'},
  {id: '3', out: '0', type: 'FORWARD'},
  {id: '1', type: 'FORWARD'},
  {id: '2', type: 'FORWARD'},
  {id: '2', type: 'settle'},
];

const tests = [
  {
    args: makeArgs({only_allow: [pair], only_disallow: [pair]}),
    description: 'Either an allow list or a disallow list is expected',
    error: 'ExpectedEitherAllowOrDisallowPairsToEnforceForwardRules',
  },
  {
    args: makeArgs({only_allow: pair}),
    description: 'An allow list is expected to be an array',
    error: 'ExpectedArrayOfOnlyAllowPairs',
  },
  {
    args: makeArgs({only_disallow: pair}),
    description: 'A disallow list is expected to be an array',
    error: 'ExpectedArrayOfOnlyDisallowPairs',
  },
  {
    args: makeArgs({only_allow: []}),
    description: 'An allow list is expected to have pairs',
    error: 'ExpectedOnlyAllowPairsToEnforceForwardRequestRules',
  },
  {
    args: makeArgs({only_disallow: []}),
    description: 'A disallow list is expected to have pairs',
    error: 'ExpectedOnlyDisallowPairsToEnforceForwardRequestRules',
  },
  {
    args: makeArgs({lnd: undefined}),
    description: 'An lnd object is required to enforce forward rules',
    error: 'ExpectedLndToEnforceForwardRequestRules',
  },
  {
    args: makeArgs({}),
    description: 'Forwards are accepted when there are no rules',
    expected: [],
  },
  {
    args: makeArgs({
      lnd: makeLnd({blocks: ['error']}),
      max_seconds_since_last_block: 60,
    }),
    description: 'A blocks subscription error is emitted',
    expected: [{
      error: [
        503,
        'UnexpectedErrorInBlocksSubscription',
        {err: [503, 'UnexpectedErrInBlocksSubscription', {err: 'err'}]},
      ],
    }],
  },
  {
    args: makeArgs({
      lnd: makeLnd({blocks: [200], is_info_failing: true, requests: []}),
      min_activation_age: 1,
    }),
    description: 'A failure to get wallet info on a new block is emitted',
    expected: [{error: [503, 'GetWalletInfoErr', {err: 'err'}]}],
  },
  {
    args: makeArgs({
      lnd: makeLnd({is_info_failing: true}),
      max_seconds_since_last_block: 60,
    }),
    description: 'A forward is rejected when chain info cannot be found',
    expected: [
      rejected([in1, out1], 'FailedToGetWalletInfoForChainConstraints'),
      {error: [503, 'FailedToGetWalletInfoForChainConstraints']},
    ],
  },
  {
    args: makeArgs({max_seconds_since_last_block: 60}),
    description: 'A forward is rejected when the last block is too old',
    expected: [rejected([in1, out1], 'LastBlockReceivedTooLongAgo')],
  },
  {
    args: makeArgs({
      lnd: makeLnd({blocks: [200, 201]}),
      max_seconds_since_last_block: 60,
    }),
    description: 'A forward is accepted when the last block is recent',
    expected: [],
  },
  {
    args: makeArgs({lnd: makeLnd({requests: ['error']})}),
    description: 'A forward requests subscription error is emitted',
    expected: [
      {error: [503, 'UnexpectedErrorInForwardInterceptor', {err: 'err'}]},
    ],
  },
  {
    args: makeArgs({stop_channels: [in1.channel]}),
    description: 'A forward is rejected when inbound is on the stop list',
    expected: [rejected([in1, out1], 'InboundChannelDeniedDueToStopList')],
  },
  {
    args: makeArgs({
      lnd: makeLnd({requests: [[in1, out1], [in1, out1], [in1, out4]]}),
      stop_channels: [out3.channel],
    }),
    description: 'A forward is rejected when outbound is to a stopped peer',
    expected: [
      rejected([in1, out1], 'OutboundChannelDeniedDueToStopList'),
      rejected([in1, out1], 'OutboundChannelDeniedDueToStopList'),
    ],
  },
  {
    args: makeArgs({stop_channels: [unknown.channel]}),
    description: 'A forward is rejected when a stop channel is not found',
    expected: [
      rejected(
        [in1, out1],
        'FailedToFindChannelDetailsForReferencedStopChannel'
      ),
    ],
  },
  {
    args: makeArgs({
      lnd: makeLnd({requests: [[in1, out1], [in2, out2], [in1, out4]]}),
      only_allow: [pair],
    }),
    description: 'A forward is rejected when not on the allow list',
    expected: [rejected([in1, out4], 'RoutingPairNotDeclaredInOnlyAllowList')],
  },
  {
    args: makeArgs({
      lnd: makeLnd({requests: [[in1, out1], [in1, out4]]}),
      only_disallow: [pair],
    }),
    description: 'A forward is rejected when on the disallow list',
    expected: [rejected([in1, out1], 'RoutingPairSpecifiedInDenyForwardsList')],
  },
  {
    args: makeArgs({
      lnd: makeLnd({requests: [[in1, unknown]]}),
      only_allow: [pair],
    }),
    description: 'A forward is rejected when a pair channel is not found',
    expected: [
      rejected(
        [in1, unknown],
        'FailedToFindChannelDetailsForReferencedChannel'
      ),
    ],
  },
  {
    args: makeArgs({max_new_pending_per_hour: 0}),
    description: 'A forward is rejected when no new HTLCs are allowed',
    expected: [rejected([in1, out1], 'NoNewHtlcsAccepted')],
  },
  {
    args: makeArgs({
      lnd: makeLnd({htlcs: ['error']}),
      max_new_pending_per_hour: 1,
    }),
    description: 'A forwards subscription error is emitted',
    expected: [{error: 'err'}],
  },
  {
    args: makeArgs({max_new_pending_per_hour: 1}),
    description: 'A forward is accepted when no HTLCs are pending',
    expected: [],
  },
  {
    args: makeArgs({
      lnd: makeLnd({htlcs: pendingHtlcs}),
      max_new_pending_per_hour: 1,
    }),
    description: 'A forward is rejected when too many HTLCs are pending',
    expected: [rejected([in1, out1], 'TooManyNewPendingHtlcsInThePastHour')],
  },
  {
    args: makeArgs({
      lnd: makeLnd({htlcs: pendingHtlcs}),
      max_new_pending_per_hour: 2,
    }),
    description: 'A forward is accepted when few HTLCs are pending',
    expected: [],
  },
  {
    args: makeArgs({lnd: makeLnd({blocks: [104]}), min_activation_age: 6}),
    description: 'A forward is rejected when a channel is not activated yet',
    expected: [
      rejected([in1, out1], 'WaitingForChannelConfirmationActivation'),
    ],
  },
  {
    args: makeArgs({lnd: makeLnd({blocks: [1000]}), min_activation_age: 6}),
    description: 'A forward is accepted when channels are activated',
    expected: [],
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    if (!!error) {
      throws(() => enforceRules(args), new Error(error), 'Got expected err');
    } else {
      const events = [];
      const sub = enforceRules(args);

      sub.on('error', error => events.push({error}));
      sub.on('rejected', rejected => events.push({rejected}));

      // Wait for the forward requests to be processed
      await delay(100);

      sub.removeAllListeners();

      deepEqual(events, expected, 'Got expected events');
    }

    return;
  });
});
