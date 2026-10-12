const {decodeBech32Address} = require('@alexbosworth/blockchain');
const {scriptElementsAsScript} = require('@alexbosworth/blockchain');

const encodeVersion = version => 80 + version;

/** Map a bech32 address to an output script

  {
    address: <Bech32 Address String>
  }

  @throws
  <Error>

  @returns
  {
    script: <Output Script Hex String>
  }
*/
module.exports = ({address}) => {
  const decoded = decodeBech32Address({address});

  // Encode the version as a script number
  const version = !decoded.version ? Number() : encodeVersion(decoded.version);

  // Bech32 addresses are a version number plus a data push
  const elements = [version, decoded.program];

  return {script: scriptElementsAsScript({elements}).script};
};
