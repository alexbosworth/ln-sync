const EventEmitter = require('events');

const asyncForever = require('async/forever');
const {getPendingChannels} = require('ln-service');

const asOutpoint = chan => `${chan.transaction_id}:${chan.transaction_vout}`;
const defaultPollingDelay = 1000 * 60;
const events = ['closing', 'opening'];
const sumOf = arr => arr.reduce((sum, n) => sum + n, Number());

/** Subscribe to new pending channels

  {
    [delay]: <Polling Delay Milliseconds Number>
    lnd: <Authenticated LND API Object>
  }

  @return
  <EventEmitter Object>

  @event 'closing'
  {
    channels: [{
      capacity: <Channel Capacity Tokens Number>
      is_partner_initiated: <Channel Partner Initiated Channel Bool>
      partner_public_key: <Channel Peer Public Key String>
      transaction_id: <Channel Funding Transaction Id Hex String>
      transaction_vout: <Channel Funding Transaction Output Index Number>
    }]
  }

  @event 'opening'
  {
    channels: [{
      capacity: <Channel Capacity Tokens Number>
      is_partner_initiated: <Channel Partner Initiated Channel Bool>
      partner_public_key: <Channel Peer Public Key String>
      transaction_id: <Channel Funding Transaction Id Hex String>
      transaction_vout: <Channel Funding Transaction Output Index Number>
    }]
  }
*/
module.exports = ({delay, lnd}) => {
  const emitter = new EventEmitter();
  const state = {};

  asyncForever(cbk => {
    return getPendingChannels({lnd}, (err, res) => {
      if (!!err) {
        return cbk(err);
      }

      const isFirstRun = !state.pending;
      const pending = res.pending_channels;

      state.pending = state.pending || {closing: [], opening: []};

      // Find new outpoint that are closing
      const newlyClosing = pending
        .filter(channel => channel.is_closing)
        .filter(channel => {
          const point = asOutpoint(channel);

          return !state.pending.closing.find(n => asOutpoint(n) === point);
        });

      // Find new outpoints that are opening
      const newlyOpening = pending
        .filter(channel => channel.is_opening)
        .filter(channel => {
          const outpoint = asOutpoint(channel);

          // Cannot find this channel in opening
          return !state.pending.opening.find(n => asOutpoint(n) === outpoint);
        });

      // Remember pending closes
      state.pending.closing = pending.filter(n => n.is_closing);

      // Remember pending opens
      state.pending.opening = pending.filter(n => n.is_opening);

      // When initializing the pending channels, ignore all the present ones
      if (!!isFirstRun) {
        return setTimeout(cbk, delay || defaultPollingDelay);
      }

      // Stop polling when there are no event listeners
      if (!sumOf(events.map(n => emitter.listenerCount(n)))) {
        return cbk(false);
      }

      if (!!newlyClosing.length) {
        emitter.emit('closing', {channels: newlyClosing});
      }

      if (!!newlyOpening.length) {
        emitter.emit('opening', {channels: newlyOpening});
      }

      return setTimeout(cbk, delay || defaultPollingDelay);
    });
  },
  err => {
    // Exit early when there are no listeners
    if (!emitter.listenerCount('error')) {
      return;
    }

    return emitter.emit('error', err);
  });

  return emitter;
};
