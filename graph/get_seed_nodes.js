const asyncAuto = require('async/auto');
const {returnResult} = require('asyncjs-util');

const api = 'https://yalls.org/v0/graph/list/';
const {isArray} = Array;
const networkNames = {btc: 'mainnet', btctestnet: 'testnet'};

/** Get a seed list of reasonable nodes

  {
    network: <Network Name String>
    request: <Request Function>
  }

  @returns via cbk or Promise
  {
    nodes: [{
      public_key: <Public Key Hex String>
    }]
  }
*/
module.exports = ({network, request}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!networkNames[network]) {
          return cbk([400, 'ExpectedNetworkToGetSeedNodes']);
        }

        if (!request) {
          return cbk([400, 'ExpectedRequestFunctionToGetSeedNodes']);
        }

        return cbk();
      },

      // Get nodes
      getNodes: ['validate', ({}, cbk) => {
        const url = `${api}${networkNames[network]}`;

        return request({url, json: true}, (err, r, res) => {
          if (!!err) {
            return cbk([503, 'UnexpectedErrorGettingSeedNodes', {err}]);
          }

          if (!res || !isArray(res.nodes)) {
            return cbk([503, 'UnexpectedResultFromSeedNodesResponse']);
          }

          if (!!res.nodes.filter(n => !n.public_key).length) {
            return cbk([503, 'ExpectedPublicKeyInSeedNodesResult']);
          }

          const nodes = res.nodes
            .filter(n => !!n.is_balanced)
            .map(n => ({public_key: n.public_key}));

          return cbk(null, {nodes});
        });
      }],
    },
    returnResult({reject, resolve, of: 'getNodes'}, cbk));
  });
};
