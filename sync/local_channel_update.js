const changesToRecord = require('./changes_to_record');

const {isArray} = Array;

/** Local channel update

  {
    channel: {
      commit_transaction_fee: <Commitment Transaction Fee Tokens Number>
      commit_transaction_weight: <Commitment Transaction Weight Units Number>
      is_active: <Channel Is Active Bool>
      local_balance: <Channel Local Balance Tokens Number>
      received: <Channel Received Tokens Number>
      remote_balance: <Channel Remote Balance Tokens Number>
      sent: <Channel Sent Tokens Number>
      unsettled_balance: <Channel Unsettled Tokens Number>
    }
    record: {
      _rev: <Record Revision Number>
      commit_transaction_fee: <Commitment Transaction Fee Tokens Number>
      commit_transaction_weight: <Commitment Transaction Weight Units Number>
      is_active: <Channel Is Active Bool>
      local_balance: <Channel Local Balance Tokens Number>
      received: <Channel Received Tokens Number>
      remote_balance: <Channel Remote Balance Tokens Number>
      sent: <Channel Sent Tokens Number>
      unsettled_balance: <Channel Unsettled Tokens Number>
    }
  }

  @returns
  {
    [changes]: {
      _rev: {
        add: <Record Increment Number>
      }
      [commit_transaction_fee]: {
        set: <Commitment Transaction Fee Tokens Number>
      }
      [commit_transaction_weight]: {
        set: <Commitment Transaction Weight Units Number>
      }
      [is_active]: {
        set: <Channel Is Active Bool>
      }
      [local_balance]: {
        set: <Channel Local Balance Tokens Number>
      }
      [received]: {
        set: <Channel Received Tokens Number>
      }
      [remote_balance]: {
        set: <Channel Remote Balance Tokens Number>
      }
      [sent]: {
        set: <Channel Sent Tokens Number>
      }
      [unsettled_balance]: {
        set: <Channel Unsettled Tokens Number>
      }
    }
    [previous]: {
      [commit_transaction_fee]: <Commitment Transaction Fee Tokens Number>
      [commit_transaction_weight]: <Commitment Transaction Weight Units Number>
      [is_active]: <Channel Is Active Bool>
      [local_balance]: <Channel Local Balance Tokens Number>
      [received]: <Channel Received Tokens Number>
      [remote_balance]: <Channel Remote Balance Tokens Number>
      [sent]: <Channel Sent Tokens Number>
      [unsettled_balance]: <Channel Unsettled Tokens Number>
    }
    [updates]: {
      [commit_transaction_fee]: <Commitment Transaction Fee Tokens Number>
      [commit_transaction_weight]: <Commitment Transaction Weight Units Number>
      [is_active]: <Channel Is Active Bool>
      [local_balance]: <Channel Local Balance Tokens Number>
      [received]: <Channel Received Tokens Number>
      [remote_balance]: <Channel Remote Balance Tokens Number>
      [sent]: <Channel Sent Tokens Number>
      [unsettled_balance]: <Channel Unsettled Tokens Number>
    }
  }
*/
module.exports = ({channel, record}) => {
  if (!channel) {
    throw new Error('ExpectedChannelToDeriveLocalChannelUpdate');
  }

  if (!record) {
    throw new Error('ExpectedChannelRecordToDeriveLocalChannelUpdate');
  }

  return changesToRecord({
    record: {
      commit_transaction_fee: record.commit_transaction_fee,
      commit_transaction_weight: record.commit_transaction_weight,
      is_active: record.is_active,
      local_balance: record.local_balance,
      received: record.received,
      remote_balance: record.remote_balance,
      sent: record.sent,
      unsettled_balance: record.unsettled_balance,
    },
    updated: {
      commit_transaction_fee: channel.commit_transaction_fee,
      commit_transaction_weight: channel.commit_transaction_weight,
      is_active: channel.is_active,
      local_balance: channel.local_balance,
      received: channel.received,
      remote_balance: channel.remote_balance,
      sent: channel.sent,
      unsettled_balance: channel.unsettled_balance,
    },
  });
};
