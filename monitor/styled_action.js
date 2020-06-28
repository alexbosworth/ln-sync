const {bold} = require('colorette');
const colorette = require('colorette');

const {colors} = require('./log_line_styling');

/** Styled action for an event log line

  {
    action: <Action String>
    event: <Event Name String>
    is_local: <Event is Local Bool>
    is_major: <Event is Major Bool>
  }

  @returns
  <Action String>
*/
module.exports = args => {
  if (!!args.is_local && !!args.is_major) {
    return bold(colorette[colors[args.event]](args.action));
  }

  if (!!args.is_local) {
    return colorette[colors[args.event]](args.action);
  }

  return colorette[colors[args.event]](args.action);
};
