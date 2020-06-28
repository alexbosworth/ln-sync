const {createHash} = require('crypto');

const hash160 = n => createHash('sha256').update(Buffer.from(n)).digest();
const separator = ':';

/** Determine a key for a record

  {
    id: <Record Id String>
    type: <Record Type String>
  }

  @returns
  {
    key: <Key Buffer Object>
  }
*/
module.exports = ({id, type}) => {
  return {key: hash160([type, id].join(separator))};
};
