const {emojis} = require('./log_line_styling');

const styledAction = require('./styled_action');
const styledSubject = require('./styled_subject');

/** Get a log line for a change event

  {
    [description]: {
      action: <Action String>
      detail: <Detail String>
      is_local: <Event Is Local Bool>
      is_major: <Event Is Major Bool>
      subject: <Subject String>
    }
    event: <Event Name String>
  }

  @returns
  {
    [line]: <Log Line String>
  }
*/
module.exports = ({description, event}) => {
  if (!description) {
    return {};
  }

  const emoji = emojis[event];
  const date = new Date().toISOString();
  const detail = description.detail || String();

  const action = styledAction({
    event,
    action: description.action,
    is_local: description.is_local,
    is_major: description.is_major,
  });

  const subject = styledSubject({
    event,
    is_local: description.is_local,
    is_major: description.is_major,
    subject: description.subject,
  });

  return {line: `${date} ${emoji} ${subject} ${action} ${detail}`.trim()};
};
