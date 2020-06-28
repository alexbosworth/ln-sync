const add = 1;
const equalSets = (a, b) => a.size === b.size && [...a].every(n => b.has(n));
const {isArray} = Array;
const {keys} = Object;
const uniq = arr => Array.from(new Set(arr));

/** Derive a changeset for an updated record vs its original

  {
    record: <Record Object>
    updated: <Updated Object>
  }

  @returns
  {
    [changes]: {
      _rev: {
        add: <Record Increment Number>
      }
      [<Changed Attribute String>]: {
        set: <Updated Value Object>
      }
    }
    [previous]: {
      <Changed Attribute String>: <Previous Value Object>
    }
    [updates]: {
      <Changed Attribute String>: <Updated Value Object>
    }
  }
*/
module.exports = ({record, updated}) => {
  const attributes = uniq([].concat(keys(record)).concat(keys(updated)));

  const changed = attributes.filter(n => {
    // Exit early when an element is an array
    if (isArray(record[n]) || isArray(updated[n])) {
      return !equalSets(new Set(record[n] || []), new Set(updated[n] || []));
    }

    return record[n] !== updated[n]
  });

  // Exit early when nothing changed
  if (!changed.length) {
    return {};
  }

  const changes = changed.reduce((sum, attribute) => {
    sum[attribute] = {set: updated[attribute]};

    return sum;
  },
  {_rev: {add}});

  const previous = changed.reduce((sum, attribute) => {
    sum[attribute] = record[attribute];

    return sum;
  },
  {});

  const updates = changed.reduce((sum, attribute) => {
    sum[attribute] = updated[attribute];

    return sum;
  },
  {});

  return {changes, previous, updates};
};
