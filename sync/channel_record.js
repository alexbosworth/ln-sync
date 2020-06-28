const bufferFromHex = hex => Buffer.from(hex, 'hex');
const createRecordRev = 0;
const emptyId = Buffer.alloc(32).toString('hex');

/** Channel record creation

  {
    channel: {
      capacity: <Maximum Tokens Number>
      id: <Standard Format Channel Id String>
      policies: [{
        public_key: <Node Public Key String>
      }]
      transaction_id: <Transaction Id Hex String>
      transaction_vout: <Transaction Output Index Number>
    }
  }

  @returns
  {
    record: {
      _rev: <Record Revision Number>
      [capacity]: <Maximum Tokens Number>
      id: <Standard Format Channel Id String>
      public_keys: [<Node Public Key Buffer Object>]
      [transaction_id]: <Transaction Id Buffer Object>
      [transaction_vout]: <Transaction Output Index Number>
    }
  }
*/
module.exports = ({channel}) => {
  if (!channel) {
    throw new Error('ExpectedChannelToDeriveChannelRecord');
  }

  // Exit early when the transaction id is absent
  if (!channel.transaction_id || channel.transaction_id === emptyId) {
    return {
      record: {
        _rev: createRecordRev,
        id: channel.id,
        public_keys: channel.policies.map(n => bufferFromHex(n.public_key)),
      },
    };
  }

  return {
    record: {
      _rev: createRecordRev,
      capacity: channel.capacity,
      id: channel.id,
      public_keys: channel.policies.map(n => bufferFromHex(n.public_key)),
      transaction_id: bufferFromHex(channel.transaction_id),
      transaction_vout: channel.transaction_vout,
    },
  };
};
