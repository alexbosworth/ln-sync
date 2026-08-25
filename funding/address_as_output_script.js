const {decodeBase58Address} = require('@alexbosworth/blockchain');
const {p2pkhOutputScript} = require('@alexbosworth/blockchain');
const {p2shOutputScript} = require('@alexbosworth/blockchain');

const bech32AddressAsScript = require('./bech32_address_as_script');

const bufferAsHex = buffer => buffer.toString('hex');
const p2pkhAddressVersions = [0, 111];
const p2shAddressVersions = [5, 196];

/** Map a chain address to an output script

  Supported addresses are bech32 or bech32m witness addresses like p2wpkh,
  p2wsh, and p2tr, plus base58 p2pkh and p2sh addresses.

  {
    address: <Address String>
  }

  @throws
  <Error>

  @returns
  {
    script: <Output Script Hex String>
  }
*/
module.exports = ({address}) => {
  // Exit early when the address is bech32 encoded
  try {
    return {script: bech32AddressAsScript({address}).script};
  } catch (err) {
    // Ignore errors, the address may be base58 encoded
  }

  const {hash, version} = decodeBase58Address({address});

  if (p2pkhAddressVersions.includes(version)) {
    return {script: bufferAsHex(p2pkhOutputScript({hash}).script)};
  }

  if (p2shAddressVersions.includes(version)) {
    return {script: bufferAsHex(p2shOutputScript({hash}).script)};
  }

  throw new Error('UnexpectedAddressVersionToDeriveOutputScript');
};
