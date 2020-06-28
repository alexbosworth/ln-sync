const asyncRetry = require('async/retry');

const {syncChannel} = require('./../sync');

const interval = () => Math.round(Math.random() * 1e5);
const times = 1e3;

/** Create channel event

  {
    db: <Database Object>
    emitter: <Changes EventEmitter Object>
    id: <Channel Id String>
    lnd: <Authenticated LND API Object>
  }

  @event 'channel_added'
  {
    id: <Channel Id String>
  }
*/
module.exports = async ({db, emitter, lnd, id}) => {
  return await asyncRetry({interval, times}, async () => {
    const synced = await syncChannel({db, id, lnd});

    // Exit early when this channel was already known
    if (!synced.created) {
      return;
    }

    return emitter.emit('channel_added', {id: synced.created.id});
  });
};
