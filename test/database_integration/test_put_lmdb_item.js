const {join} = require('path');
const {mkdirSync} = require('fs');
const {randomBytes} = require('crypto');
const {statSync} = require('fs');
const {tmpdir} = require('os');

const rimraf = require('rimraf');
const {test} = require('@alexbosworth/tap');

const {getLmdbItem} = require('./../../database');
const {openLmdbDatabase} = require('./../../database');
const {putLmdbItem} = require('./../../database');
const {queryLmdb} = require('./../../database');

const fs = {getFileStatus: statSync, makeDirectory: mkdirSync};
const key = Buffer.alloc(1, 1);
const randomDir = () => randomBytes(20).toString('hex');
const record = {record: 'record'};
const removeDir = dir => new Promise(resolve => rimraf(dir, () => resolve()));
const table = 'table';

// When putting an item into the database, it should store without error
return test('LMDB Database Put Item', async ({deepIs, end, rejects}) => {
  const path = join(tmpdir(), randomDir());

  mkdirSync(path);

  await putLmdbItem({
    key,
    record,
    db: (await openLmdbDatabase({fs, path})).db,
  });

  const got = await getLmdbItem({
    key,
    db: (await openLmdbDatabase({fs, path})).db,
  });

  deepIs(got.record, record, 'Successfully put record');

  const {records} = await queryLmdb({
    db: (await openLmdbDatabase({fs, path})).db,
  });

  deepIs(records, [{record, key: key.toString('hex')}]);

  await removeDir(path);

  return end();
});
