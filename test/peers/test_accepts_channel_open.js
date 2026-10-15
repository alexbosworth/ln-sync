const EventEmitter = require('node:events');
const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const acceptsChannelOpen = require('./../../peers/accepts_channel_open');

const makeLnd = ({cancelErr, openErr}) => {
  return {
    default: {
      fundingStateStep: ({}, cbk) => cbk(cancelErr),
      openChannel: ({}) => {
        const sub = new EventEmitter();

        process.nextTick(() => {
          // Exit early when the channel proposal is rejected
          if (!!openErr) {
            return sub.emit('error', openErr);
          }

          return sub.emit('data', {
            psbt_fund: {funding_address: 'address', funding_amount: '1'},
            update: 'psbt_fund',
          });
        });

        return sub;
      },
    },
  };
};

const makeArgs = overrides => {
  const args = {
    capacity: 1e6,
    lnd: makeLnd({}),
    partner_public_key: Buffer.alloc(33, 2).toString('hex'),
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const tests = [
  {
    args: makeArgs({capacity: undefined}),
    description: 'A capacity is required to test channel open acceptance',
    error: [400, 'ExpectedCapacityOfChannelToTestAcceptance'],
  },
  {
    args: makeArgs({lnd: undefined}),
    description: 'An lnd object is required to test channel open acceptance',
    error: [400, 'ExpectedLndToTestChannelOpenAcceptance'],
  },
  {
    args: makeArgs({partner_public_key: undefined}),
    description: 'A peer key is required to test channel open acceptance',
    error: [400, 'ExpectedPeerPublicKeyToTestChannelOpen'],
  },
  {
    args: makeArgs({lnd: makeLnd({openErr: 'err'})}),
    description: 'A rejected channel proposal returns an error',
    error: [503, 'UnexpectedErrorOpeningChannels', {err: 'err'}],
  },
  {
    args: makeArgs({lnd: makeLnd({cancelErr: 'err'})}),
    description: 'A failure to cancel the channel proposal returns an error',
    error: [503, 'UnexpectedErrorCancelingPendingChannel', {err: 'err'}],
  },
  {
    args: makeArgs({}),
    description: 'An accepted channel proposal is returned',
    expected: {is_accepted: true},
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    if (!!error) {
      await rejects(acceptsChannelOpen(args), error, 'Got expected error');
    } else {
      deepEqual(await acceptsChannelOpen(args), expected, 'Got result');
    }

    return;
  });
});
