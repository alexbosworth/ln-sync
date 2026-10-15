const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const getPayments = require('./../../transactions/get_payments');

const asDate = seconds => new Date(seconds * 1e3).toISOString();
const makeId = n => Buffer.alloc(32, n).toString('hex');

const makeRpcPayment = ({created, id}) => ({
  creation_date: String(created),
  creation_time_ns: '0',
  fee_sat: '0',
  htlcs: [],
  payment_hash: makeId(id),
  payment_index: String(id),
  payment_preimage: Buffer.alloc(32).toString('hex'),
  value_msat: '1000',
  value_sat: '1',
});

const makeExpected = ({created, id}) => ({
  attempts: [],
  confirmed_at: undefined,
  created_at: asDate(created),
  destination: undefined,
  fee: undefined,
  fee_mtokens: undefined,
  hops: [],
  id: makeId(id),
  index: id,
  is_confirmed: false,
  is_outgoing: true,
  mtokens: '1000',
  request: undefined,
  safe_fee: undefined,
  safe_tokens: 1,
  secret: undefined,
  tokens: 1,
});

// The first page of payments is newer, the last page is older
const newer = {created: 2000, id: 1};
const older = {created: 1000, id: 2};

// A payment on a page that should not be reached when paging is stopped
const unreached = {created: 2500, id: 3};

const makeLnd = ({err, pages}) => {
  return {
    default: {
      listPayments: ({index_offset}, cbk) => {
        // Exit early when listing payments should fail
        if (!!err) {
          return cbk(err);
        }

        const page = pages[index_offset];

        return cbk(null, {
          first_index_offset: page.first_index_offset,
          last_index_offset: page.first_index_offset,
          payments: page.payments.map(makeRpcPayment),
        });
      },
    },
  };
};

const lnd = makeLnd({
  pages: {
    0: {first_index_offset: '2', payments: [newer]},
    2: {first_index_offset: '1', payments: [older]},
  },
});

const makeArgs = overrides => {
  const args = {lnd};

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const tests = [
  {
    args: makeArgs({lnd: undefined}),
    description: 'An lnd object is required to get payments',
    error: [400, 'ExpectedAuthenticatedLndToGetPayments'],
  },
  {
    args: makeArgs({lnd: makeLnd({err: 'err'})}),
    description: 'A failure to get payments returns an error',
    error: [503, 'UnexpectedGetPaymentsError', {err: 'err'}],
  },
  {
    args: makeArgs({}),
    description: 'All pages of payments are returned',
    expected: {payments: [makeExpected(newer), makeExpected(older)]},
  },
  {
    args: makeArgs({
      after: asDate(1500),
      lnd: makeLnd({
        pages: {
          0: {first_index_offset: '3', payments: [newer, older]},
          3: {first_index_offset: '1', payments: [unreached]},
        },
      }),
    }),
    description: 'Paging stops once payments are created before a date',
    expected: {payments: [makeExpected(newer)]},
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    if (!!error) {
      await rejects(getPayments(args), error, 'Got expected error');
    } else {
      deepEqual(await getPayments(args), expected, 'Got expected result');
    }

    return;
  });
});
