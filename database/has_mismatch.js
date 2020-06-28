const equalSets = (a, b) => a.size === b.size && [...a].every(n => b.has(n));
const {isArray} = Array;
const {keys} = Object;

/** Determine if there is a mismatch with change expectations

  {
    expect: {
      <Expected Attribute String>: <Expected Value Object>
    }
    record: {
      <Stored Attribute String>: <Stored Value Object>
    }
  }

  @returns
  {
    [mismatch]: <Mismatched Attribute String>
  }
*/
module.exports = ({expect, record}) => {
  const mismatch = keys(expect).find(key => {
    if (isArray(expect[key]) && !isArray(record[key])) {
      return false;
    }

    if (isArray(expect[key])) {
      return equalSets(new Set(expect[key]), new Set(record[key]));
    }

    return record[key] !== expect[key];
  });

  return {mismatch};
};
