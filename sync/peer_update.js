const changesToRecord = require('./changes_to_record');

const {isArray} = Array;

/** Peer update

  {
    peer: {
      features: [<BOLT 09 Feature Bit Number>]
      is_connected: <Is Connected Peer Bool>
      is_inbound: <Is Inbound Peer Bool>
      [is_sync_peer]: <Is Syncing Graph Data Bool>
      public_key: <Public Key Hex String>
      socket: <Network Address And Port String>
    }
    record: {
      _rev: <Record Revision Number>
      features: [<BOLT 09 Feature Bit Number>]
      is_connected: <Is Connected Peer Bool>
      is_inbound: <Is Inbound Peer Bool>
      [is_sync_peer]: <Is Syncing Graph Data Bool>
      public_key: <Public Key Buffer Object>
      socket: <Network Address And Port String>
    }
  }

  @returns
  {
    [changes]: {
      _rev: {
        add: <Record Increment Number>
      }
      [features]: {
        set: [<BOLT 09 Feature Bit Number>]
      }
      [is_connected]: {
        set: <Is Connected Peer Bool>
      }
      [is_inbound]: {
        set: <Is Inbound Peer Bool>
      }
      [is_sync_peer]: {
        set: <Is Syncing Graph Data Bool>
      }
      [socket]: {
        set: <Network Address And Port String>
      }
    }
    [previous]: {
      [features]: [<BOLT 09 Feature Bit Number>]
      [is_connected]: <Is Connected Peer Bool>
      [is_inbound]: <Is Inbound Peer Bool>
      [is_sync_peer]: <Is Syncing Graph Data Bool>
      [socket]: <Network Address And Port String>
    }
    [updates]: {
      [features]: [<BOLT 09 Feature Bit Number>]
      [is_connected]: <Is Connected Peer Bool>
      [is_inbound]: <Is Inbound Peer Bool>
      [is_sync_peer]: <Is Syncing Graph Data Bool>
      [socket]: <Network Address And Port String>
    }
  }
*/
module.exports = ({peer, record}) => {
  if (!peer) {
    throw new Error('ExpectedPeerToDeriveNodeUpdate');
  }

  if (!record) {
    throw new Error('ExpectedPeerRecordToDerivePeerUpdate');
  }

  const hasFeatures = isArray(peer.features) && !!peer.features.length;

  return changesToRecord({
    record: {
      features: record.features,
      is_connected: record.is_connected,
      is_inbound: record.is_inbound,
      is_sync_peer: record.is_sync_peer,
      socket: record.socket,
    },
    updated: {
      features: !hasFeatures ? record.features : peer.features,
      is_connected: peer.is_connected,
      is_inbound: peer.is_inbound,
      is_sync_peer: peer.is_sync_peer,
      socket: peer.socket,
    },
  });
};
