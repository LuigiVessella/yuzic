import { loadCarDetails } from './loadCarDetails';

it('loads beyond the old twenty-item cap with at most three concurrent requests', async () => {
  let active = 0;
  let maximum = 0;
  let completed = 0;
  const batch = jest.fn();
  const tasks = Array.from({ length: 55 }, () => async () => {
    maximum = Math.max(maximum, ++active);
    await Promise.resolve();
    active--;
    completed++;
  });
  await loadCarDetails(tasks, batch, () => false);
  expect(completed).toBe(55);
  expect(maximum).toBe(3);
  expect(batch).toHaveBeenCalledTimes(19);
});

it('continues past failed requests without retrying them in a loop', async () => {
  const failure = jest.fn(async () => { throw new Error('offline'); });
  const success = jest.fn(async () => undefined);
  await loadCarDetails([failure, success, success, success], jest.fn(), () => false);
  expect(failure).toHaveBeenCalledTimes(1);
  expect(success).toHaveBeenCalledTimes(3);
});

it('stops scheduling and publishing when the account or catalog changes', async () => {
  let stopped = false;
  const task = jest.fn(async () => { stopped = true; });
  const batch = jest.fn();
  await loadCarDetails(Array.from({ length: 25 }, () => task), batch, () => stopped);
  expect(task).toHaveBeenCalledTimes(3);
  expect(batch).not.toHaveBeenCalled();
});
