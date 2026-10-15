const EventEmitter = require('node:events');
const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const waitForConnectedPeer = require('./../../peers/wait_for_connected_peer');

const id = Buffer.alloc(33, 3).toString('hex');
const other = Buffer.alloc(33, 2).toString('hex');

const makePeer = key => ({
  address: 'address',
  bytes_recv: '1',
  bytes_sent: '1',
  features: {},
  flap_count: 0,
  inbound: true,
  last_flap_ns: '0',
  ping_time: '1',
  pub_key: key,
  sat_recv: '1',
  sat_sent: '1',
  sync_type: 'ACTIVE_SYNC',
});

const makeLnd = ({events, peers}) => {
  let call = 0;

  return {
    default: {
      listPeers: ({}, cbk) => cbk(null, {peers: peers[call++].map(makePeer)}),
      subscribePeerEvents: ({}) => {
        const sub = new EventEmitter();

        sub.cancel = () => {};

        (events || []).forEach((event, i) => {
          return setTimeout(() => {
            // Exit early when the subscription should emit an error
            if (event === 'error') {
              return sub.emit('error', 'err');
            }

            return sub.emit('data', {pub_key: event, type: 'PEER_ONLINE'});
          },
          1 + i * 10);
        });

        return sub;
      },
    },
  };
};

const makeArgs = overrides => {
  const args = {id, lnd: makeLnd({peers: [[id], [id]]})};

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const tests = [
  {
    args: makeArgs({id: undefined}),
    description: 'A public key is required to wait for a connected peer',
    error: [400, 'ExpectedIdentityPublicKeyToWaitForConnection'],
  },
  {
    args: makeArgs({lnd: undefined}),
    description: 'An lnd object is required to wait for a connected peer',
    error: [400, 'ExpectedAuthenticatedLndToWaitForConnection'],
  },
  {
    args: makeArgs({
      lnd: makeLnd({events: [other, 'error'], peers: [[], []]}),
    }),
    description: 'An error waiting for a peer returns an error',
    error: [503, 'UnexpectedErrorWaitingForPeer', {err: 'err'}],
  },
  {
    args: makeArgs({lnd: makeLnd({peers: [[], []]}), timeout: 10}),
    description: 'A peer that does not connect returns an error',
    error: [504, 'FailedToFindConnectedPeer'],
  },
  {
    args: makeArgs({}),
    description: 'An already connected peer is returned',
  },
  {
    args: makeArgs({
      lnd: makeLnd({events: [other, id], peers: [[other], [other, id]]}),
    }),
    description: 'A connecting peer is waited for',
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    if (!!error) {
      await rejects(waitForConnectedPeer(args), error, 'Got expected error');
    } else {
      deepEqual(await waitForConnectedPeer(args), expected, 'Got result');
    }

    return;
  });
});
