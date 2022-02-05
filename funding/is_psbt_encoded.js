const {decodePsbt} = require('psbt');

/** Determine if a string is PSBT encoded

  {
    ecp: <ECPair Object>
    input: <PSBT Input String>
  }

  @returns
  {
    is_psbt: <String is PSBT Encoded Bool>
  }
*/
module.exports = ({ecp, input}) => {
  try {
    return {is_psbt: !!decodePsbt({ecp, psbt: input})};
  } catch (e) {
    return {is_psbt: false};
  }
};
