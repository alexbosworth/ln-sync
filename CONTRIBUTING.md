# Contribution Guidelines

## Testing

### Unit Tests

- Every method has a unit test file in the `test` folder that matches the
    method's folder, like `test/chain/test_get_max_funding_value.js` for
    `chain/get_max_funding_value.js`
- Unit tests use `node:test` and strict `node:assert`, and `npm test` runs
    them with coverage
- A method's unit tests should cover all of its lines and branches
- All of the test cases go in a single `tests` array
- Each case has `args`, a `description`, and either the `error` it should
    reject with or the result it is `expected` to return
- Build `args` with a `makeArgs` helper that applies overrides to valid
    default arguments

```js
const tests = [
  {
    args: makeArgs({fee_tokens_per_vbyte: undefined}),
    description: 'A fee rate is required',
    error: [400, 'ExpectedFeeRateToCalculateMaxFundingValue'],
  },
  {
    args: makeArgs({}),
    description: 'The max funding value is calculated',
    expected: {fee_tokens_per_vbyte: 3, max_tokens: 4999999634},
  },
];
```

- A test file has one runner, and no other `test` calls
- Keep the runner minimal, don't add other assertions to it

```js
tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    if (!!error) {
      await rejects(method(args), error, 'Got expected error');
    } else {
      const res = await method(args);

      deepEqual(res, expected, 'Got expected result');
    }

    return;
  });
});
```

- Use `makeLnd` from `mock-lnd` for standard LND responses
- When the request sent to LND matters, write a small mock LND object that
    responds the way LND would to that request. A wrong request then shows up
    as a wrong result or an error in a regular test case.

### Integration Tests

- Integration tests go in `test/integration` and use `ln-docker-daemons` to
    run against real LND nodes
- An integration test file has a single test
- Run them with `npm run integration-tests`

## Control Flow

- Use `asyncAuto` with `returnResult` for async methods, so that they support
    both callback and Promise styles
- When an `asyncAuto` task needs a `try {} catch {}`, wrap the task in
    `asyncify` and `return` the result or `throw` the error instead of calling
    `cbk`
- Put the code that needs a `try {} catch {}` in its own `asyncAuto` task as
    much as possible, rather than sharing a task with other `cbk` logic
- Throw errors in the same `[code, 'Message', details]` form as `cbk` errors
- Tasks without a `try {} catch {}` stay in the regular `cbk` style

```js
// Decode the funded PSBT
funded: ['fund', asyncify(({fund}) => {
  try {
    return decodePsbt({psbt: fund.psbt});
  } catch (err) {
    throw [503, 'FailedToDecodeFundedPsbt', {err: err.message}];
  }
})],
```

- Calling `cbk` inside a `try` can start later tasks in the same call. If one
    of them throws, the `catch` calls `cbk` a second time and async.js fails
    with "Callback was already called". `asyncify` calls back after the `try`.
- See the `funded` task in `chain/get_max_funding_value.js` for an example:
    it only decodes the PSBT, and the `max` task that uses it stays in `cbk`
    style
