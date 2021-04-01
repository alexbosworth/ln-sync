const {join} = require('path');
const {mkdirSync} = require('fs');
const {randomBytes} = require('crypto');
const {statSync} = require('fs');
const {tmpdir} = require('os');

const rimraf = require('rimraf');
const {test} = require('tap');

const {getLmdbItem} = require('./../../database');
const {openLmdbDatabase} = require('./../../database');
const {putLmdbItem} = require('./../../database');
const {updateLmdbItem} = require('./../../database');

const fs = {getFileStatus: statSync, makeDirectory: mkdirSync};
const key = Buffer.alloc(1, 1);
const randomDir = () => randomBytes(20).toString('hex');
const record = {record: 'record'};
const removeDir = dir => new Promise(resolve => rimraf(dir, () => resolve()));
const table = 'table';

// When updating an item in the database, it should update without error
return test('LMDB Database Update Item', async ({end, strictSame}) => {
  const path = join(tmpdir(), randomDir());

  mkdirSync(path);

  await putLmdbItem({
    key,
    record,
    db: openLmdbDatabase({fs, path}).db,
  });

  await updateLmdbItem({
    key,
    changes: {record: {set: 'changed'}},
    db: openLmdbDatabase({fs, path}).db,
  });

  const got = await getLmdbItem({key, db: openLmdbDatabase({fs, path}).db});

  strictSame(got.record, {record: 'changed'}, 'Successfully put record');

  await removeDir(path);

  return end();
});
