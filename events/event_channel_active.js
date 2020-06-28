const asyncRetry = require('async/retry');

const {syncLocalChannel} = require('./../sync');

const interval = () => Math.round(Math.random() * 1e5);
const times = 20;

/** Channel activity changed event

  {
    db: <Database Object>
    emitter: <EventEmitter Object>
    lnd: <Authenticated LND API Object>
    public_key: <Node Pubilc Key Hex String>
    transaction_id: <Hex Encoded Transaction Id String>
    transaction_vout: <Transaction Output Index Number>
  }

  @event 'channel_disabled'
  {
    id: <Channel Id String>
    public_key: <Node Public Key Hex String>
  }

  @event 'channel_enabled'
  {
    id: <Channel Id String>
    public_key: <Node Public Key Hex String>
  }
*/
module.exports = async args => {
  return await asyncRetry({interval, times}, async () => {
    const synced = await syncLocalChannel({
      db: args.db,
      lnd: args.lnd,
      public_key: args.public_key,
      transaction_id: args.transaction_id,
      transaction_vout: args.transaction_vout,
    });

    if (!!synced.updates && synced.updates.is_active === false) {
      return args.emitter.emit('channel_disabled', {
        id: synced.original.id,
        public_key: args.public_key,
      });
    }

    if (!!synced.updates && synced.updates.is_active === true) {
      return args.emitter.emit('channel_enabled', {
        id: synced.original.id,
        public_key: args.public_key,
      });
    }

    return;
  });
};
