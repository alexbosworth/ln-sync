const asyncAuto = require('async/auto');
const {getWalletInfo} = require('lightning/lnd_methods');
const {returnResult} = require('asyncjs-util');

const {chains} = require('./networks');

const {keys} = Object;
const reversedBytes = hex => Buffer.from(hex, 'hex').reverse().toString('hex');

/** Get network name for lnd

  {
    lnd: <Authenticated LND API Object>
  }

  @returns via cbk or Promise
  {
    network: <Network Name String>
  }
*/
module.exports = ({lnd}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!lnd) {
          return cbk([400, 'ExpectedLndToGetNetworkForLnd']);
        }

        return cbk();
      },

      // Get wallet info
      getInfo: ['validate', ({}, cbk) => getWalletInfo({lnd}, cbk)],

      // Network for swap
      network: ['getInfo', ({getInfo}, cbk) => {
        const [chain, otherChain] = getInfo.chains;

        if (!!otherChain) {
          return cbk([400, 'CannotDetermineChainFromNode']);
        }

        const network = keys(chains).find(network => {
          return chain === reversedBytes(chains[network]);
        });

        if (!network) {
          return cbk([400, 'ExpectedLndWithKnownChain']);
        }

        return cbk(null, {network});
      }],
    },
    returnResult({reject, resolve, of: 'network'}, cbk));
  });
};
