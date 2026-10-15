const {deepEqual} = require('node:assert').strict;
const {makeInvoice} = require('mock-lnd');
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const getAllInvoices = require('./../../transactions/get_all_invoices');

const asDate = seconds => new Date(seconds * 1e3).toISOString();
const makeId = n => Buffer.alloc(32, n).toString('hex');

const makeRpcInvoice = ({created, id, settled}) => ({
  ...makeInvoice({is_confirmed: true}),
  creation_date: String(created),
  r_hash: Buffer.from(makeId(id), 'hex'),
  settle_date: String(settled),
});

const makeExpected = ({created, id, settled}) => ({
  chain_address: undefined,
  cltv_delta: 1,
  confirmed_at: asDate(settled),
  confirmed_index: 1,
  created_at: asDate(created),
  description: '',
  description_hash: undefined,
  expires_at: asDate(created + 1),
  features: [],
  id: makeId(id),
  index: 1,
  is_canceled: undefined,
  is_confirmed: true,
  is_held: undefined,
  is_private: false,
  is_push: undefined,
  mtokens: '1000',
  payment: undefined,
  payments: [],
  received: 1,
  received_mtokens: '1000',
  request: makeInvoice({}).payment_request,
  secret: Buffer.alloc(32).toString('hex'),
  tokens: 1,
});

// The first page of invoices is newer, the last page is older
const newer = {created: 2000, id: 1, settled: 3000};
const older = {created: 1000, id: 2, settled: 1500};

// An invoice on a page that should not be reached when paging is stopped
const unreached = {created: 2500, id: 3, settled: 3500};

const makeLnd = ({err, pages}) => {
  return {
    default: {
      listInvoices: ({index_offset}, cbk) => {
        // Exit early when listing invoices should fail
        if (!!err) {
          return cbk(err);
        }

        const page = pages[index_offset];

        return cbk(null, {
          first_index_offset: page.first_index_offset,
          invoices: page.invoices.map(makeRpcInvoice),
          last_index_offset: page.first_index_offset,
        });
      },
    },
  };
};

const lnd = makeLnd({
  pages: {
    0: {first_index_offset: '2', invoices: [newer]},
    2: {first_index_offset: '1', invoices: [older]},
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
    description: 'An lnd object is required to get all invoices',
    error: [400, 'ExpectedAuthenticatedLndToGetAllInvoices'],
  },
  {
    args: makeArgs({lnd: makeLnd({err: 'err'})}),
    description: 'A failure to get invoices returns an error',
    error: [503, 'UnexpectedGetInvoicesError', {err: 'err'}],
  },
  {
    args: makeArgs({}),
    description: 'All pages of invoices are returned',
    expected: {invoices: [makeExpected(newer), makeExpected(older)]},
  },
  {
    args: makeArgs({confirmed_after: asDate(2000)}),
    description: 'Only invoices confirmed after a date are returned',
    expected: {invoices: [makeExpected(newer)]},
  },
  {
    args: makeArgs({
      created_after: asDate(1500),
      lnd: makeLnd({
        pages: {
          0: {first_index_offset: '3', invoices: [newer, older]},
          3: {first_index_offset: '1', invoices: [unreached]},
        },
      }),
    }),
    description: 'Paging stops once invoices are created before a date',
    expected: {invoices: [makeExpected(newer)]},
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    if (!!error) {
      await rejects(getAllInvoices(args), error, 'Got expected error');
    } else {
      deepEqual(await getAllInvoices(args), expected, 'Got expected result');
    }

    return;
  });
});
