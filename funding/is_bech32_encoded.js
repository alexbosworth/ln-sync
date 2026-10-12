const {decodeBech32Address} = require('@alexbosworth/blockchain');

/** Determine if a string is a bech32 or bech32m encoded witness address

  {
    input: <Input String>
  }

  @returns
  {
    is_bech32: <String is Bech32 Encoded Bool>
  }
*/
module.exports = ({input}) => {
  try {
    return {is_bech32: !!decodeBech32Address({address: input})};
  } catch (e) {
    return {is_bech32: false};
  }
};
