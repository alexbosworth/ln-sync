const EventEmitter = require('node:events');
const {deepEqual} = require('node:assert').strict;
const {makeInvoice} = require('mock-lnd');
const {makePaymentData} = require('mock-lnd');
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const method = require('./../../transactions/get_rebalance_payments');

const after = new Date(1000).toISOString();
const makeId = n => Buffer.alloc(32, n).toString('hex');
const zeroKey = Buffer.alloc(33).toString('hex');

const makeExpectedPayment = id => ({
  destination: zeroKey,
  confirmed_at: '1970-01-01T00:00:00.001Z',
  created_at: '1970-01-01T00:00:00.000Z',
  fee: 1,
  fee_mtokens: '1000',
  hops: [{
    channel: '0x0x1',
    fee: 1,
    fee_mtokens: '1000',
    forward: 1,
    forward_mtokens: '1000',
    public_key: zeroKey,
    timeout: 1,
  }],
  id: makeId(id),
  index: '1',
  mtokens: '2000',
  paths: [{
    fee: 1,
    fee_mtokens: '1000',
    hops: [{
      channel: '0x0x1',
      fee: 1,
      fee_mtokens: '1000',
      forward: 1,
      forward_mtokens: '1000',
      public_key: zeroKey,
      timeout: 1,
    }],
    mtokens: '1000',
    payment: Buffer.alloc(32).toString('hex'),
    timeout: 1,
    tokens: 1,
    total_mtokens: '1000',
  }],
  request: makeInvoice({}).payment_request,
  safe_fee: 1,
  safe_tokens: 2,
  secret: Buffer.alloc(32).toString('hex'),
  timeout: 1,
  tokens: 2,
});

const makeLnd = ({err, invoices, paid}) => {
  return {
    default: {
      listInvoices: ({}, cbk) => {
        // Exit early when listing invoices should fail
        if (!!err) {
          return cbk(err);
        }

        return cbk(null, {
          first_index_offset: '1',
          invoices: invoices.map(id => ({
            ...makeInvoice({is_confirmed: true}),
            creation_date: '2',
            r_hash: Buffer.from(makeId(id), 'hex'),
          })),
          last_index_offset: '1',
        });
      },
    },
    router: {
      trackPaymentV2: ({payment_hash}) => {
        const id = payment_hash.toString('hex');
        const sub = new EventEmitter();

        sub.cancel = () => {};

        process.nextTick(() => {
          // Exit early when the payment is a failure
          if (paid[id] === 'error') {
            return sub.emit('error', 'err');
          }

          // Exit early when there is no payment to the invoice
          if (!paid[id]) {
            return sub.emit('error', {details: `payment isn't initiated`});
          }

          return sub.emit('data', {
            ...makePaymentData({}),
            payment_hash: id,
          });
        });

        return sub;
      },
    },
  };
};

const makeArgs = overrides => {
  const args = {
    after,
    lnds: [
      makeLnd({invoices: [1], paid: {[makeId(2)]: true}}),
      makeLnd({invoices: [2], paid: {}}),
    ],
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const tests = [
  {
    args: makeArgs({after: undefined}),
    description: 'An after date is required to get rebalance payments',
    error: [400, 'ExpectedAfterDateToGetRebalancePayments'],
  },
  {
    args: makeArgs({lnds: undefined}),
    description: 'An array of lnds is required to get rebalance payments',
    error: [400, 'ExpectedArrayOfLndsToGetRebalancePayments'],
  },
  {
    args: makeArgs({lnds: [makeLnd({err: 'err'})]}),
    description: 'A failure to get invoices returns an error',
    error: [503, 'UnexpectedGetInvoicesError', {err: 'err'}],
  },
  {
    args: makeArgs({
      lnds: [makeLnd({invoices: [1], paid: {[makeId(1)]: 'error'}})],
    }),
    description: 'A failure to get a payment returns an error',
    error: [503, 'UnexpectedGetPaymentError', {err: 'err'}],
  },
  {
    args: makeArgs({}),
    description: 'Payments to invoices are returned as rebalances',
    expected: {payments: [makeExpectedPayment(2)]},
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    if (!!error) {
      await rejects(method(args), error, 'Got expected error');
    } else {
      deepEqual(await method(args), expected, 'Got expected result');
    }

    return;
  });
});
