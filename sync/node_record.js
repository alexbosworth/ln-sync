const bufferFromHex = hex => Buffer.from(hex, 'hex');
const createRecordRev = 0;
const emptyId = Buffer.alloc(32).toString('hex');

/** Node record creation

  {
    node: {
      alias: <Node Alias String>
      color: <Node Color String>
      features: [<Feature Bit Number>]
      public_key: <Node Public Key Hex String>
      [sockets]: [<Node Socket String>]
      updated_at: <Node Details Updated At ISO 8601 Date String>
    }
  }

  @returns
  {
    record: {
      _rev: <Record Revision Number>
      alias: <Node Alias String>
      color: <Node Color String>
      features: [<Feature Bit Number>]
      public_key: <Node Public Key Buffer>
      [sockets]: [<Node Socket String>]
      updated_at: <Node Details Updated At ISO 8601 Date String>
    }
  }
*/
module.exports = ({node}) => {
  if (!node) {
    throw new Error('ExpectedNodeToDeriveNodeRecord');
  }

  return {
    record: {
      _rev: createRecordRev,
      alias: node.alias,
      color: node.color,
      features: node.features,
      public_key: bufferFromHex(node.public_key),
      sockets: node.sockets,
      updated_at: node.updated_at,
    },
  };
};
