
import { FAKE_USER, NETWORK_ERROR, NO_ANSWER, type FakeApi, type FakeResponse } from './harness/fakeApi';
import { expect, test } from './harness/test';

// How the app talks to kino.watch, seen from the server side. Every session start loads the account
// (GET /v1/user) and checks the device in (POST /v1/device/notify), which makes them handy probes.

const USER_OK: FakeResponse = { json: { status: 200, user: FAKE_USER } };

/** Answers the n-th call with responses[n], and the last response from then on. */
function inTurn(...responses: FakeResponse[]): () => FakeResponse {
  let call = 0;
  return () => responses[Math.min(call++, responses.length - 1)]!;
}

const count = (api: FakeApi, method: string, path: string) => () => api.requestsTo(method, path).length;

test('a GET that fails with a server error or a dropped connection is retried after 1 s, then 3 s', async ({
  app,
  api,
  clock,
}) => {
  api.on('GET', '/v1/user', inTurn({ status: 503, json: {} }, NETWORK_ERROR, USER_OK));
  await clock.pause();
  await app.open();
  const users = count(api, 'GET', '/v1/user');
  await expect.poll(users).toBe(1);

  await clock.runFor(999);
  expect(users()).toBe(1);
  await clock.runFor(1);
  await expect.poll(users).toBe(2);

  await clock.runFor(2_999);
  expect(users()).toBe(2);
  await clock.runFor(1);
  await expect.poll(users).toBe(3);

  await clock.runFor(10_000);
  expect(users()).toBe(3); // succeeded, so no more tries
});

test('a GET is tried three times at most', async ({ app, api, clock }) => {
  api.on('GET', '/v1/user', { status: 500, json: {} });
  await clock.pause();
  await app.open();

  await clock.runFor(1_000);
  await clock.runFor(3_000);
  await expect.poll(count(api, 'GET', '/v1/user')).toBe(3);
  await clock.runFor(60_000);
  expect(count(api, 'GET', '/v1/user')()).toBe(3);
});

test('a POST is never retried, so a write is never sent twice', async ({ app, api, clock }) => {
  api.on('POST', '/v1/device/notify', { status: 503, json: {} });
  await clock.pause();
  await app.open();
  await expect.poll(count(api, 'POST', '/v1/device/notify')).toBe(1);

  await clock.runFor(60_000);
  expect(count(api, 'POST', '/v1/device/notify')()).toBe(1);
});

test('a request with no answer is given up after 15 s, and a GET is then retried', async ({ app, api, clock }) => {
  api.on('GET', '/v1/user', inTurn(NO_ANSWER, USER_OK));
  await clock.pause();
  await app.open();
  const users = count(api, 'GET', '/v1/user');
  await expect.poll(users).toBe(1);

  await clock.runFor(15_999); // 15 s timeout + 1 s before the retry, minus 1 ms
  expect(users()).toBe(1);
  await clock.runFor(1);
  await expect.poll(users).toBe(2);
});
