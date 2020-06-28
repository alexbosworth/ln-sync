const EventEmitter = require('events');

const {getNetworkGraph} = require('ln-service');
const {getWalletInfo} = require('ln-service');
const {subscribeToChannels} = require('ln-service');
const {subscribeToBlocks} = require('ln-service');
const {subscribeToGraph} = require('ln-service');
const {subscribeToPeers} = require('ln-service');

const emitError = require('./emit_error');
const subscribeToForwards = require('./subscribe_to_forwards');
const syncFromDataEvents = require('./sync_from_data_events');

/** Subscribe to changes

  {
    db: <Database Object>
    lnd: <Authenticated LND API Object>
  }

  @throws
  <Error>

  @returns
  <EventEmitter Object>

  @event 'block'
  {
    height: <Block Height Number>
    id: <Block Hash Hex String>
  }
*/
module.exports = ({db, lnd}) => {
  if (!db) {
    throw new Error('ExpectedDatabaseToSubscribeToChanges');
  }

  if (!lnd) {
    throw new Error('ExpectedLndToSubscribeToChanges');
  }

  const emitter = new EventEmitter();

  const blocks = subscribeToBlocks({lnd});
  const channels = subscribeToChannels({lnd});
  const {forwards} = subscribeToForwards({lnd});
  const graph = subscribeToGraph({lnd});
  const peers = subscribeToPeers({lnd});

  blocks.on('error', err => emitError({emitter, err}));
  channels.on('error', err => emitError({emitter, err}));
  forwards.on('error', err => emitError({emitter, err}));
  graph.on('error', err => emitError({emitter, err}));
  peers.on('error', err => emitError({emitter, err}));

  syncFromDataEvents({
    blocks,
    channels,
    db,
    emitter,
    forwards,
    graph,
    lnd,
    peers,
  },
  err => emitError({emitter, err: [503, 'UnexpectedDataEventsError', {err}]}));

  return emitter;
};
