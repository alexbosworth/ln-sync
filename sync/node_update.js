const changesToRecord = require('./changes_to_record');

/** Node update

  {
    node: {
      alias: <Node Alias String>
      color: <Node Color String>
      features: [<Feature Bit Number>]
      public_key: <Node Public Key String>
      [sockets]: [<Network Host And Port String>]
      [updated_at]: <Update Received At ISO 8601 Date String>
    }
    record: {
      _rev: <Record Revision Number>
      alias: <Node Alias String>
      color: <Node Color String>
      features: [<Feature Bit Number>]
      public_key: <Node Public Key Buffer Object>
      [sockets]: [<Node Socket String>]
      [updated_at]: <Node Details Updated At ISO 8601 Date String>
    }
  }

  @returns
  {
    [changes]: {
      _rev: {
        add: <Record Increment Number>
      }
      [alias]: {
        set: <Node Alias String>
      }
      [color]: {
        set: <Node Color String>
      }
      [features]: {
        set: [<Feature Bit Number>]
      }
      [sockets]: {
        set: [<Socket String>]
      }
      [updated_at]: {
        set: <Update Received At ISO 8601 Date String>
      }
    }
    [previous]: {
      [alias]: <Node Alias String>
      [color]: <Node Color String>
      [features]: [<Feature Bit Number>]
      [sockets]: [<Network Host And Port String>]
      [updated_at]: <Update Received At ISO 8601 Date String>
    }
    [updates]: {
      [alias]: <Node Alias String>
      [color]: <Node Color String>
      [features]: [<Feature Bit Number>]
      [sockets]: [<Network Host And Port String>]
      [updated_at]: <Update Received At ISO 8601 Date String>
    }
  }
*/
module.exports = ({node, record}) => {
  if (!node) {
    throw new Error('ExpectedNodeoDeriveNodeUpdate');
  }

  if (!record) {
    throw new Error('ExpectedNodeRecordToDeriveNodeUpdate');
  }

  return changesToRecord({
    record: {
      alias: record.alias,
      color: record.color,
      features: record.features,
      sockets: record.sockets,
      updated_at: record.updated_at,
    },
    updated: {
      alias: node.alias,
      color: node.color,
      features: !!node.features.length ? node.features : record.features,
      sockets: node.sockets,
      updated_at: node.updated_at || record.updated_at,
    },
  });
};
