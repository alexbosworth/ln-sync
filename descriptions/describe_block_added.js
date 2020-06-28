/** Describe block mined

  {
    height: <Block Height Number>
    id: <Block Hash Hex String>
  }

  @returns
  {
    [description]: {
      action: <Action String>
      detail: <Detail String>
      subject: <Subject String>
    }
  }
*/
module.exports = ({height, id}) => {
  return {
    description: {
      action: `advanced to height ${height}`,
      detail: `${id}`,
      subject: `Blockchain`,
    },
  };
};
