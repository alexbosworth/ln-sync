const {bold} = require('colorette');
const colorette = require('colorette');

const {colors} = require('./log_line_styling');

/** Styled subject for an event log line

  {
    event: <Event Name String>
    is_local: <Event is Local Bool>
    is_major: <Event is Major Bool>
    subject: <Subject String>
  }

  @returns
  <Subject String>
*/
module.exports = args => {
  if (!!args.is_local && !!args.is_major) {
    return bold(colorette[colors[args.event]](args.subject));
  }

  if (!!args.is_local) {
    return colorette[colors[args.event]](args.subject);
  }

  return args.subject;
};
