const asyncAuto = require('async/auto');
const {returnResult} = require('asyncjs-util');

const {getGraphPair} = require('./../graph');

const bigUnits = tokens => !tokens ? String() : (tokens / 1e8).toFixed(8);
const short = key => key.substring(0, 16);

/** Describe a channel being closed

  {
    db: <Database Object>
    id: <Channel Id String>
  }

  @returns via cbk or Promise
  {
    [description]: {
      action: <Action String>
      detail: <Detail String>
      subject: <Subject String>
    }
  }
*/
module.exports = ({db, id}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!db) {
          return cbk([400, 'ExpectedDbToDescribeChannelClosed']);
        }

        if (!id) {
          return cbk([400, 'ExpectedChannelToDescribeChannelClosed']);
        }

        return cbk();
      },

      // Get the channel pair
      getPair: ['validate', ({}, cbk) => getGraphPair({db, id}, cbk)],

      // Describe the event
      description: ['getPair', ({getPair}, cbk) => {
        // Exit early when there is no known channel
        if (!getPair.pair) {
          return cbk(null, {});
        }

        const channel = `${bigUnits(getPair.channel.capacity)} channel`.trim();
        const [p1, p2] = getPair.pair.nodes.map(n => n.alias || short(n.id));

        return cbk(null, {
          description: {
            action: `closed ${channel}`,
            detail: `${id}`,
            subject: `${p1} and ${p2}`,
          },
        });
      }],
    },
    returnResult({reject, resolve, of: 'description'}, cbk));
  });
};
