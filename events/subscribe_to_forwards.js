const EventEmitter = require('events');

const {subscribeToForwards} = require('lightning/lnd_methods');

/** Subscribe to HTLC forwarding events

  {
    lnd: <Authenticated LND API Object>
  }

  @returns
  {
    forwards: <Forwards EventEmitter Object>
  }
*/
module.exports = ({lnd}) => {
  try {
    return {forwards: subscribeToForwards({lnd})};
  } catch (err) {
    // Return a dummy eventEmitter when subscribeToForwards is not supported
    return {forwards: new EventEmitter()};
  }
};
