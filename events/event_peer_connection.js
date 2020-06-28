const asyncRetry = require('async/retry');

const {syncPeer} = require('./../sync');

const interval = () => Math.round(Math.random() * 1e5);
const times = 20;

/** Peer connectivity changed

  {
    db: <Database Object>
    emitter: <EventEmitter Object>
    id: <Peer Public Key Hex String>
    lnd: <Authenticated LND API Object>
    node: <Node Public Key Hex String>
  }

  @returns via Promise
*/
module.exports = async ({db, emitter, id, lnd, node}) => {
  return await asyncRetry({interval, times}, async () => {
    const synced = await syncPeer({db, id, lnd});

    if (!!synced.updates && !!synced.previous.is_connected) {
      emitter.emit('disconnected', {node, from: id});
    }

    if (!!synced.updates && !!synced.updates.is_connected) {
      emitter.emit('reconnected', {node, to: id});
    }

    if (!!synced.updates && !!synced.created) {
      emitter.emit('new_peer', {node, public_key: id});
    }

    return;
  });
};
