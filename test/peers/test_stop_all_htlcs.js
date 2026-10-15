const EventEmitter = require('node:events');
const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const {listChannelsResponse} = require('./../fixtures');
const stopAllHtlcs = require('./../../peers/stop_all_htlcs');

const peer = Buffer.alloc(33, 2).toString('hex');

const makeChannel = id => ({
  ...listChannelsResponse.channels[0],
  chan_id: id,
  remote_pubkey: peer,
});

const makeForwardRequest = ({inbound, outbound}) => ({
  custom_records: {},
  incoming_amount_msat: '2000',
  incoming_circuit_key: {chan_id: inbound, htlc_id: '0'},
  incoming_expiry: 200,
  outgoing_amount_msat: '1000',
  outgoing_expiry: 100,
  outgoing_requested_chan_id: outbound,
  payment_hash: Buffer.alloc(32),
});

const makeLnd = ({channels, err}) => {
  let call = 0;

  return {
    default: {
      listChannels: ({}, cbk) => {
        // Exit early when getting channels should fail
        if (!!err) {
          return cbk(err);
        }

        return cbk(null, {channels: channels[call++].map(makeChannel)});
      },
    },
    router: {
      htlcInterceptor: ({}) => {
        const sub = new EventEmitter();

        sub.cancel = () => {};
        sub.write = ({}) => {};

        // Forwards with the peer are rejected and others are accepted
        [
          makeForwardRequest({inbound: '1', outbound: '9'}),
          makeForwardRequest({inbound: '9', outbound: '2'}),
          makeForwardRequest({inbound: '8', outbound: '9'}),
        ]
        .forEach(request => setTimeout(() => sub.emit('data', request), 10));

        return sub;
      },
    },
  };
};

const makeArgs = overrides => {
  const args = {
    id: '0x0x1',
    ids: ['0x0x1'],
    lnd: makeLnd({channels: [['1', '2'], ['2']]}),
    peer,
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const tests = [
  {
    args: makeArgs({id: undefined}),
    description: 'A channel id is required to stop HTLCs',
    error: [400, 'ExpectedChannelIdToStopHtlcsFor'],
  },
  {
    args: makeArgs({ids: undefined}),
    description: 'An array of peer channel ids is required to stop HTLCs',
    error: [400, 'ExpectedArrayOfChannelIdsToStopAllHtlcs'],
  },
  {
    args: makeArgs({lnd: undefined}),
    description: 'An lnd object is required to stop HTLCs',
    error: [400, 'ExpectedAuthenticatedLndToStopAllHtlcs'],
  },
  {
    args: makeArgs({peer: undefined}),
    description: 'A peer public key is required to stop HTLCs',
    error: [400, 'ExpectedPeerToStopAllHtlcsWith'],
  },
  {
    args: makeArgs({lnd: makeLnd({err: 'err'})}),
    description: 'A failure to get channels returns an error',
    error: [503, 'UnexpectedGetChannelsError', {err: 'err'}],
  },
  {
    args: makeArgs({}),
    description: 'HTLCs are stopped until the channel is gone',
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    if (!!error) {
      await rejects(stopAllHtlcs(args), error, 'Got expected error');
    } else {
      deepEqual(await stopAllHtlcs(args), expected, 'Got expected result');
    }

    return;
  });
});
