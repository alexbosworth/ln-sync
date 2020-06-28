const asyncRetry = require('async/retry');

const emitError = require('./emit_error');
const {syncNode} = require('./../sync');

const interval = () => Math.round(Math.random() * 1e5);
const times = 1e3;

/** Node updated event

  {
    db: <Database Object>
    emitter: <EventEmitter Object>
    id: <Node Public Key Hex String>
    lnd: <Authenticated LND API Object>
  }

  @returns via Promise
*/
module.exports = async ({db, emitter, id, lnd}) => {
  return await asyncRetry({interval, times}, async () => {
    const synced = await syncNode({db, id, lnd});

    if (!!synced.created) {
      return emitter.emit('node_added', {public_key: id});
    }

    // Exit early when there are no updates
    if (!synced.updates) {
      return;
    }

    if (synced.updates.alias !== undefined) {
      emitter.emit('node_alias_updated', {
        previous: synced.previous.alias,
        public_key: id,
        updated: synced.updates.alias,
      });
    }

    if (synced.updates.color !== undefined) {
      emitter.emit('node_color_updated', {
        previous: synced.previous.color,
        public_key: id,
        updated: synced.updates.color,
      });
    }

    if (synced.updates.features !== undefined) {
      emitter.emit('node_features_updated', {
        previous: synced.previous.features,
        public_key: id,
        updated: synced.updates.features,
      });
    }

    if (synced.updates.sockets !== undefined) {
      emitter.emit('node_sockets_updated', {
        previous: synced.previous.sockets,
        public_key: id,
        updated: synced.updates.sockets,
      });
    }

    return;
  });
};
