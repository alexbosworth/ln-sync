const EventEmitter = require('events');

const asyncDoUntil = require('async/doUntil');
const {subscribeToChannels} = require('lightning/lnd_methods');
const {subscribeToGraph} = require('lightning/lnd_methods');

const emitError = require('./emit_error');
const subscribeToForwards = require('./subscribe_to_forwards');
const syncFromDataEvents = require('./sync_from_data_events');

const subRestartDelayMs = 1000 * 5;

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

  asyncDoUntil(
    cbk => {
      const channels = subscribeToChannels({lnd});
      const {forwards} = subscribeToForwards({lnd});
      const graph = subscribeToGraph({lnd});

      const subs = [channels, forwards, graph];

      subs.forEach(sub => {
        sub.on('error', () => {
          // Eliminate other listeners to prevent duplicate events
          subs.forEach(n => n.removeAllListeners());

          // Restart the subscription
          return setTimeout(cbk, subRestartDelayMs);
        });
      });

      syncFromDataEvents({
        channels,
        db,
        emitter,
        forwards,
        graph,
        lnd,
      },
      err => {
        if (!!err) {
          emitError({emitter, err: [503, 'UnexpectedSyncError', {err}]});
        }

        // Restart the subscription
        return setTimeout(() => cbk(), subRestartDelayMs);
      });
    },
    cbk => cbk(null, !emitter.listenerCount('error')),
    err => {
      if (!!err) {
        return emitError({emitter, err: [503, 'UnexpectedChangesErr', {err}]});
      }

      return;
    }
  );

  return emitter;
};
