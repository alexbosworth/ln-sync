const {isBuffer} = Buffer;
const {keys} = Object;

/** Check if data is matching where restrictions

  {
    data: {
      $attribute_name: <Value>
    }
    where: {
      $attribute_name: {
        [eq]: <Equals Value>
        [gt]: <Greater Than String>
        [starts_with]: <Starts With String>
      }
    }
  }

  @throws
  <Error>

  @returns
  <Is Matching Where Bool>
*/
module.exports = ({data, where}) => {
  const violatesWhere = keys(where).find(attr => {
    if (isBuffer(where[attr].eq) && data[attr].equals(where[attr].eq)) {
      return false;
    }

    if (where[attr].eq !== undefined && data[attr] !== where[attr].eq) {
      return true;
    }

    if (!!where[attr].gt && data[attr] <= where[attr].gt) {
      return true;
    }

    const startsWith = where[attr].starts_with;

    if (!!startsWith && !data[attr]) {
      return true;
    }

    if (!!startsWith && !data[attr].startsWith(startsWith)) {
      return true;
    }

    return false;
  });

  return !violatesWhere;
};