# Versions

## 4.1.1

- `getNodeFunds`: Add method to return wallet balance sums for a node

## 4.0.5

- `getMaxFundAmount`: Fix support for finding the max P2TR spend on LND 0.15.3

## 4.0.1

- End support for Node.js 12, require Node.js 14 or higher

## 3.14.0

- `acceptsChannelOpen`: Add support for `is_trusted_funding`

## 3.13.1

- Add support for node.js 18+

## 3.13.0

- `fundPsbtDisallowingInputs`: Add method to fund a PSBT without some UTXOs

## 3.12.2

- `findConfirmedOutput`: Add method to find a confirmed output

## 3.11.1

- `waitForConnectedPeer`: Add method to wait for a peer to connect

## 3.10.1

- `subscribeToPendingChannels`: Add method to poll for opening/closing channels

## 3.9.3

- `enforceForwardRequestRules`: Add `min_activation_age` for age constraint
- `enforceForwardRequestRules`: Add `only_allow` for edge constraints

## 3.8.0

- `enforceForwardRequestRules`: Add method to enforce rules on HTLC requests

## 3.7.1

- `getLiquidity`: Remove support for `min_node_score` due to API EOL
- `getSeedNodes`: Add method to get some recommended starting nodes

## 3.6.1

- `updateFeeRate`: Fix issue where fee rate would not update to zero

## 3.6.0

- `reserveTransitFunds`: Add support for specifying chain fee `rate`
- `reserveTransitFunds`: Add `address`, `key`, `output`, `script`

## 3.5.0

- `askForFeeRate`: Add method to ask for a chain fee rate

## 3.4.0

- `broadcastTransaction`: Add method to broadcast a tx until it confirms
- `getFundedTransaction`: Add method to get a transaction paying to addresses
- `getTransitRefund`: Add method to generate a refund for a transit transaction
- `maintainUtxoLocks`: Keep an unspent locked while related tx is unconfirmed
- `reserveTransitFunds`: Add method to reserve funds in a transit output
- `stopAllHtlcs`: Add method to stop all HTLCs with a peer

## 3.3.0

- `updateChannelFee`: Add method to update a channel fee

## 3.2.0

- `acceptsChannelOpen`: Add method to confirm a peer accepts a chan open
- `getTransitRefund`: Add method to generate a transit output refund
- `waitForPendingOpen`: Add method to wait for a pending open channel

## 3.1.0

- `getNetwork`: Return `bitcoinjs` network name when applicable

## 3.0.1

- `connectPeer`: Add method to add a peer, looking up its network socket when necessary
- `getLiquidity`: Multiple `with` keys can now be referenced for liquidity calculation

### Breaking Changes

- `getLiquidity`: `with` to specify peers now requires an array of public keys

## 2.1.1

- Add `getMaxFundAmount` to help calculate a maximum amount that can be funded

## 2.0.3

### Breaking Changes

- Remove monitoring helper methods

## 1.0.0

### Breaking Changes

- Require node.js v12+

## 0.4.6

- `getTransactionRecord`: Include in-flight payments, optimize for multiple records

## 0.4.0

- `getPayments`: Add date constrained payments fetching

## 0.3.1

- `getLiquidity`: Add method to get total liquidity
- `getNetwork`: Add method to get the network name for a node
- `getScoredNodes`: Add method to get the list of scored nodes
- `getTransactionRecord`: Add method to get info associated with a chain tx id

## 0.2.0

- `getPeerLiquidity`: Add method to fetch liquidity with peer

## 0.1.0

- `findKey`: Add method to find a public key that matches a query
- `formatTokens`: Add method to pretty print an amount
- `getNodeAlias`: Add method to lookup a graph node's alias
