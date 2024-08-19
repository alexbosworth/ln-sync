const {deepEqual} = require('node:assert').strict;
const {randomBytes} = require('node:crypto');
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const {connectPeer} = require('./../../');
const {getNodeInfoResponse} = require('./../fixtures');

const makePublicKey = () => `03${randomBytes(32).toString('hex')}`;

const peers = [{
  address: 'address',
  bytes_recv: '1',
  bytes_sent: '1',
  features: {},
  flap_count: 0,
  inbound: true,
  last_flap_ns: '0',
  ping_time: '1',
  pub_key: Buffer.alloc(33, 3).toString('hex'),
  sat_recv: '1',
  sat_sent: '1',
  sync_type: 'ACTIVE_SYNC',
}];

const unconnectableNodeId = makePublicKey();

const makeLnd = ({addresses}) => {
  return {
    default: {
      connectPeer: ({addr}, cbk) => {
        if (addr.pubkey === unconnectableNodeId) {
          return cbk(null, {});
        }

        peers.push({
          address: addr.host,
          bytes_recv: '1',
          bytes_sent: '1',
          features: {},
          flap_count: 0,
          inbound: true,
          last_flap_ns: '0',
          ping_time: '1',
          pub_key: addr.pubkey,
          sat_recv: '1',
          sat_sent: '1',
          sync_type: 'ACTIVE_SYNC',
        });

        return cbk(null, {});
      },
      getNodeInfo: ({}, cbk) => cbk(null, {
        channels: [],
        node: {
          addresses: addresses || [{addr: 'addr', network: 'network'}],
          alias: 'alias',
          color: '#000000',
          features: {},
          last_update: '1',
          pub_key: '000000000000000000000000000000000000000000000000000000000000000000',
        },
        num_channels: '1',
        total_capacity: '1',
      }),
      listPeers: ({}, cbk) => cbk(null, {peers}),
    },
  };
};

const tests = [
  {
    args: {},
    description: 'Public key is required',
    error: [400, 'ExpectedNodePublicKeyToConnectAsPeer'],
  },
  {
    args: {id: makePublicKey()},
    description: 'LND is required',
    error: [400, 'ExpectedAuthenticatedLndToConnectPeer'],
  },
  {
    args: {id: makePublicKey(), lnd: makeLnd({}), sockets: []},
    description: 'A non empty sockets array is required',
    error: [400, 'ExpectedNonEmptyArrayOfSocketsToConnectAsPeer'],
  },
  {
    args: {id: unconnectableNodeId, lnd: makeLnd({})},
    description: 'Cannot connect to peer',
    error: [503, 'FailedToConnectToPeer'],
  },
  {
    args: {id: makePublicKey(), lnd: makeLnd({addresses: []})},
    description: 'Node has no sockets',
    error: [404, 'NoKnownSocketsForNodeToConnectTo'],
  },
  {
    args: {id: makePublicKey(), lnd: makeLnd({})},
    description: 'Peer is connected',
    expected: {},
  },
  {
    args: {id: makePublicKey(), lnd: makeLnd({}), sockets: ['0:1']},
    description: 'Socket is specified',
    expected: {},
  },
  {
    args: {id: Buffer.alloc(33, 3).toString('hex'), lnd: makeLnd({})},
    description: 'Peer is already connected',
    expected: {},
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    if (!!error) {
      await rejects(connectPeer(args), error, 'Got expected error');
    } else {
      await connectPeer(args);
    }

    return;
  });
});
