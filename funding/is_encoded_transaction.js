const {componentsOfTransaction} = require('@alexbosworth/blockchain');
const {transactionFromComponents} = require('@alexbosworth/blockchain');

/** Determine if a string can be decoded as a transaction

  {
    input: <Transaction Hex String>
  }

  @returns
  {
    is_transaction: <String is Encoded Transaction Bool>
  }
*/
module.exports = ({input}) => {
  try {
    const components = componentsOfTransaction({transaction: input});

    // Confirm the transaction encodes back to the input with no extra data
    const {transaction} = transactionFromComponents(components);

    return {is_transaction: transaction === input.toLowerCase()};
  } catch (e) {
    return {is_transaction: false};
  }
};
