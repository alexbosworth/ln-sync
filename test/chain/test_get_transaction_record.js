const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const {makeLnd} = require('mock-lnd');

const method = require('./../../chain/get_transaction_record');
const nodeInfoResponse = require('./../fixtures/get_node_info_response.json');

const id = 'c84b2436d41533f0580e4bca04ca362c3b9b33e2b2020148c27bb12e796ea64a';
const keyA = '02' + '11'.repeat(32);
const keyB = '02' + '22'.repeat(32);

// A transaction with the record id that spends an outpoint
const spendTransaction = '0100000001ea2817127b47fb3663c656ff2fb0409e5b35cf99f950642b0f9c13d566d9ee3900000000000000000001f401000000000000160014111111111111111111111111111111111111111100000000';

const makeRecordLnd = ({alias}) => {
  const lnd = makeLnd({});

  // Exit early when node lookups should fail with no getNodeInfo method
  if (alias === undefined) {
    return lnd;
  }

  const response = JSON.parse(JSON.stringify(nodeInfoResponse));

  response.node.alias = alias;

  lnd.default.getNodeInfo = (args, cbk) => cbk(null, response);

  return lnd;
};

const makeArgs = overrides => {
  const args = {
    id,
    chain_transactions: [{
      created_at: '2021-01-01T00:00:00.000Z',
      fee: 100,
      id,
      is_confirmed: true,
      is_outgoing: true,
      output_addresses: ['addr'],
      tokens: 1000,
      transaction: spendTransaction,
    }],
    channels: [{
      capacity: 500000,
      id: '3x3x3',
      partner_public_key: keyA,
      transaction_id: id,
    }],
    closed_channels: [
      {
        capacity: 1000000,
        close_payments: [],
        close_transaction_id: id,
        final_local_balance: 7,
        id: '2x2x2',
        is_cooperative_close: true,
        is_local_force_close: false,
        is_remote_force_close: false,
        partner_public_key: keyB,
        transaction_id: 'dd'.repeat(32),
        transaction_vout: 0,
      },
      {
        capacity: 500000,
        close_payments: [
          {
            is_outgoing: false,
            is_paid: false,
            is_pending: true,
            is_refunded: false,
            spent_by: id,
            tokens: 1,
            transaction_id: 'ee'.repeat(32),
            transaction_vout: 0,
          },
          {
            is_outgoing: true,
            is_paid: true,
            is_pending: false,
            is_refunded: false,
            spent_by: id,
            tokens: 2,
            transaction_id: 'ee'.repeat(32),
            transaction_vout: 1,
          },
          {
            is_outgoing: false,
            is_paid: false,
            is_pending: false,
            is_refunded: true,
            spent_by: id,
            tokens: 3,
            transaction_id: 'ee'.repeat(32),
            transaction_vout: 2,
          },
          {
            is_outgoing: false,
            is_paid: true,
            is_pending: false,
            is_refunded: false,
            spent_by: 'ff'.repeat(32),
            tokens: 4,
            transaction_id: 'ee'.repeat(32),
            transaction_vout: 3,
          },
        ],
        close_transaction_id: 'cc'.repeat(32),
        final_local_balance: 3,
        id: '3x3x3',
        is_cooperative_close: false,
        is_local_force_close: false,
        is_remote_force_close: true,
        partner_public_key: keyA,
        transaction_id: id,
        transaction_vout: 0,
      },
    ],
    lnd: makeRecordLnd({alias: 'alias'}),
    pending_channels: [{
      is_opening: true,
      local_balance: 5,
      partner_public_key: keyB,
      transaction_id: id,
      transaction_vout: 0,
    }],
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const makeRecord = overrides => {
  const record = {
    action: undefined,
    balance: undefined,
    capacity: undefined,
    channel: undefined,
    close_tx: undefined,
    node: undefined,
    open_tx: undefined,
    timelock: undefined,
    with: undefined,
  };

  Object.keys(overrides).forEach(k => record[k] = overrides[k]);

  return record;
};

const makeRelated = node => [
  makeRecord({node, action: 'payment_pending', channel: '3x3x3', with: keyA}),
  makeRecord({
    node,
    action: 'outgoing_payment_paid',
    channel: '3x3x3',
    with: keyA,
  }),
  makeRecord({
    node,
    action: 'incoming_payment_refunded',
    channel: '3x3x3',
    with: keyA,
  }),
  makeRecord({node, action: 'opening_channel', balance: 5, open_tx: id, with: keyB}),
  makeRecord({
    node,
    action: 'opened_channel',
    capacity: 500000,
    channel: '3x3x3',
    close_tx: 'cc'.repeat(32),
    open_tx: id,
    with: keyA,
  }),
  makeRecord({
    node,
    action: 'cooperatively_closed_channel',
    balance: 7,
    capacity: 1000000,
    channel: '2x2x2',
    close_tx: id,
    open_tx: 'dd'.repeat(32),
    with: keyB,
  }),
  makeRecord({
    node,
    action: 'peer_force_closed_channel',
    balance: 3,
    capacity: 500000,
    channel: '3x3x3',
    close_tx: 'cc'.repeat(32),
    open_tx: id,
    with: keyA,
  }),
];

const tests = [
  {
    args: makeArgs({id: undefined}),
    description: 'A transaction id is required to get a transaction record',
    error: new Error('400,ExpectedTransactionIdToFindRecordData'),
  },
  {
    args: makeArgs({lnd: undefined}),
    description: 'An lnd object is required to get a transaction record',
    error: new Error('400,ExpectedLndToFindChainTransactionRecordData'),
  },
  {
    args: makeArgs({}),
    description: 'A transaction record is found with node aliases',
    expected: {
      chain_fee: 100,
      received: undefined,
      related_channels: makeRelated('alias'),
      sent: undefined,
      sent_to: undefined,
      tx: id,
    },
  },
  {
    args: makeArgs({lnd: makeRecordLnd({})}),
    description: 'A record is found when node lookups fail',
    expected: {
      chain_fee: 100,
      received: undefined,
      related_channels: makeRelated(undefined),
      sent: undefined,
      sent_to: undefined,
      tx: id,
    },
  },
  {
    args: makeArgs({lnd: makeRecordLnd({alias: ''})}),
    description: 'A record is found when nodes have no alias',
    expected: {
      chain_fee: 100,
      received: undefined,
      related_channels: makeRelated(undefined),
      sent: undefined,
      sent_to: undefined,
      tx: id,
    },
  },
  {
    args: {
      id: Buffer.alloc(32).toString('hex'),
      lnd: (() => {
        const lnd = makeRecordLnd({});

        lnd.default.closedChannels = ({}, cbk) => cbk(null, {channels: []});

        return lnd;
      })(),
    },
    description: 'Records are fetched from lnd when not provided',
    expected: {
      chain_fee: 1,
      received: 1,
      related_channels: [makeRecord({
        action: 'opened_channel',
        capacity: 1,
        channel: '0x0x1',
        open_tx: Buffer.alloc(32).toString('hex'),
        with: '02'.repeat(33),
      })],
      sent: undefined,
      sent_to: undefined,
      tx: Buffer.alloc(32).toString('hex'),
    },
  },
  {
    args: {
      id: Buffer.alloc(32).toString('hex'),
      chain_transactions: [{
        created_at: '2021-01-01T00:00:00.000Z',
        id: Buffer.alloc(32).toString('hex'),
        is_confirmed: true,
        is_outgoing: true,
        output_addresses: ['addr'],
        tokens: 1000,
      }],
      channels: [],
      closed_channels: [],
      lnd: makeRecordLnd({}),
      pending_channels: [],
    },
    description: 'An unrelated transaction is a plain send record',
    expected: {
      chain_fee: undefined,
      received: undefined,
      related_channels: [],
      sent: 1000,
      sent_to: ['addr'],
      tx: Buffer.alloc(32).toString('hex'),
    },
  },
  {
    args: makeArgs({
      chain_transactions: [],
      channels: [],
      closed_channels: [{
        capacity: 0,
        close_payments: [],
        close_transaction_id: id,
        final_local_balance: 9,
        id: undefined,
        is_cooperative_close: true,
        is_local_force_close: true,
        is_remote_force_close: true,
        partner_public_key: keyB,
        transaction_id: 'dd'.repeat(32),
        transaction_vout: 0,
      }],
      lnd: makeRecordLnd({}),
      pending_channels: [],
    }),
    description: 'A no capacity close is closed in every close variation',
    expected: {
      chain_fee: undefined,
      received: undefined,
      related_channels: [
        makeRecord({
          action: 'cooperatively_closed_channel',
          balance: 9,
          close_tx: id,
          open_tx: 'dd'.repeat(32),
          with: keyB,
        }),
        makeRecord({
          action: 'force_closed_channel',
          balance: 9,
          close_tx: id,
          open_tx: 'dd'.repeat(32),
          with: keyB,
        }),
        makeRecord({
          action: 'peer_force_closed_channel',
          balance: 9,
          close_tx: id,
          open_tx: 'dd'.repeat(32),
          with: keyB,
        }),
      ],
      sent: undefined,
      sent_to: undefined,
      tx: undefined,
    },
  },
  {
    args: makeArgs({
      channels: [],
      closed_channels: [],
      lnd: makeRecordLnd({}),
      pending_channels: [{
        is_closing: true,
        local_balance: 4,
        partner_public_key: keyB,
        pending_balance: 8,
        timelock_expiration: 9,
        transaction_id: '39eed966d5139c0f2b6450f999cf355b9e40b02fff56c66336fb477b121728ea',
        transaction_vout: 0,
      }],
    }),
    description: 'A spend of a closing channel outpoint is a closing record',
    expected: {
      chain_fee: 100,
      received: undefined,
      related_channels: [makeRecord({
        action: 'channel_closing',
        balance: 8,
        timelock: 9,
        with: keyB,
      })],
      sent: undefined,
      sent_to: undefined,
      tx: id,
    },
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    if (!!error) {
      await rejects(method(args), error, 'Got expected error');
    } else {
      const res = await method(args);

      deepEqual(res, expected, 'Got expected result');
    }

    return;
  });
});
