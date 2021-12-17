const defaultIndex = 0;
const defaultValue = 0;
const {floor} = Math;
const lastElement = arr => arr[arr.length - 1];
const position = (a, above) => (a.length - 1) * above;
const topOfRange = 1;

/** Calculate a percentile for an array of tokens

  {
    above: <Top Percentile Number>
    tokens: [<Token Value Number>]
  }

  @returns
  {
    top: <Top Percentile Number>
  }
*/
module.exports = ({above, tokens}) => {
  // Exit early when asking for a percentile on no values
  if (!tokens.length) {
    return {top: defaultValue};
  }

  const array = tokens.slice().sort((a, b) => a - b);

  // Exit early when asking for a percentile at the bottom
  if (above <= defaultValue) {
    return {top: array[defaultIndex]};
  }

  // Exit early when asking for a percentile at the top
  if (above >= topOfRange) {
    return {top: lastElement(array)};
  }

  const start = position(array, above);

  const belowIndex = floor(start);

  const stopIndex = belowIndex + [above].length;

  // Exit early when the range is at the top
  if (stopIndex >= array.length) {
    return {top: array[belowIndex]};
  }

  const adjust = start % [above].length;

  const value = array[belowIndex] * ([above].length - adjust);

  return {top: value + array[stopIndex] * adjust};
};
