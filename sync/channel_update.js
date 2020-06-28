const bufferFromHex = hex => Buffer.from(hex, 'hex');
const recordIncrement = 1;

/** Channel update

  {
    channel: {
      capacity: <Maximum Tokens Number>
      transaction_id: <Transaction Id Hex String>
      transaction_vout: <Transaction Output Index Number>
    }
    record: {
      _rev: <Record Revision Number>
      [capacity]: <Maximum Tokens Number>
      [transaction_id]: <Transaction Id Hex String>
      [transaction_vout]: <Transaction Output Index Number>
    }
  }

  @returns
  {
    [changes]: {
      _rev: {
        add: <Record Increment Number>
      }
      [capacity]: {
        set: <Channel Tokens Number>
      }
      [transaction_id]: {
        set: <Transaction Id Buffer Object>
      }
      [transaction_vout]: {
        set: <Transaction Id Output Number>
      }
    }
  }
*/
module.exports = ({channel, record}) => {
  if (!channel) {
    throw new Error('ExpectedChannelToDeriveChannelUpdate');
  }

  if (!record) {
    throw new Error('ExpectedRecordToDeriveChannelUpdate');
  }

  if (!channel.capacity || !!record.capacity) {
    return {};
  }

  return {
    changes: {
      _rev: {add: recordIncrement},
      capacity: {set: channel.capacity},
      transaction_id: {set: bufferFromHex(channel.transaction_id)},
      transaction_vout: {set: channel.transaction_vout},
    },
  };
};
