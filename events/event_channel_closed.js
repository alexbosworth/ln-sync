const {markChannelClosed} = require('./../sync');

/** Channel closed event

  {
    [capacity]: <Channel Capacity Tokens Number>
    db: <Database Object>
    emitter: <EventEmitter Object>
    height: <Channel Close Height Number>
    id: <Channel Id String>
  }

  @event 'channel_closed'
  {
    [capacity]: <Channel Capacity Tokens Number>
    id: <Channel Id String>
    public_keys: [<Public Key Hex String>]
  }
*/
module.exports = async ({capacity, db, emitter, height, id}) => {
  const marked = await markChannelClosed({db, height, id});

  // Exit early when the channel was already known to be closed
  if (!marked.is_closed) {
    return;
  }

  return emitter.emit('channel_closed', {
    capacity,
    id,
    public_keys: marked.public_keys,
  });
};
