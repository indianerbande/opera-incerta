import { describe, expect, it } from 'vitest';
import { ExclusiveTask, RefreshCoordinator } from '../src/index.js';

/** A promise whose resolution the test controls. */
function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve = (): void => {};
  const promise = new Promise<void>((resolveFn) => {
    resolve = resolveFn;
  });
  return { promise, resolve };
}

describe('RefreshCoordinator', () => {
  it('runs the operation once for a single request', async () => {
    let runs = 0;
    const coordinator = new RefreshCoordinator(async () => {
      runs += 1;
    });

    await coordinator.request();
    expect(runs).toBe(1);
    expect(coordinator.isRunning).toBe(false);
  });

  it('coalesces requests made during a run into exactly one follow-up', async () => {
    const gate = deferred();
    let runs = 0;
    const coordinator = new RefreshCoordinator(async () => {
      runs += 1;
      if (runs === 1) {
        await gate.promise;
      }
    });

    const first = coordinator.request();
    const second = coordinator.request();
    const third = coordinator.request();
    const fourth = coordinator.request();

    expect(runs).toBe(1);
    expect(coordinator.hasPending).toBe(true);

    gate.resolve();
    await Promise.all([first, second, third, fourth]);

    // One follow-up covering all three later requests, not three.
    expect(runs).toBe(2);
    expect(coordinator.isRunning).toBe(false);
    expect(coordinator.hasPending).toBe(false);
  });

  it('sees a change made after the running read began', async () => {
    const gate = deferred();
    const observed: string[] = [];
    let state = 'before';
    const coordinator = new RefreshCoordinator(async () => {
      if (observed.length === 0) {
        observed.push(state);
        await gate.promise;
        return;
      }
      observed.push(state);
    });

    const running = coordinator.request();
    state = 'after';
    const requested = coordinator.request();
    gate.resolve();
    await Promise.all([running, requested]);

    expect(observed).toEqual(['before', 'after']);
  });

  it('recovers after a failing run rather than staying stuck', async () => {
    let runs = 0;
    const coordinator = new RefreshCoordinator(async () => {
      runs += 1;
      throw new Error('read failed');
    });

    await expect(coordinator.request()).rejects.toThrow('read failed');
    expect(coordinator.isRunning).toBe(false);

    await expect(coordinator.request()).rejects.toThrow('read failed');
    expect(runs).toBe(2);
  });
});

describe('ExclusiveTask', () => {
  it('runs an operation and returns its result', async () => {
    const task = new ExclusiveTask();
    await expect(task.run(async () => 'done')).resolves.toBe('done');
  });

  it('refuses an overlapping run instead of dropping it silently', async () => {
    const gate = deferred();
    const task = new ExclusiveTask();

    const first = task.run(async () => {
      await gate.promise;
      return 'first';
    });
    const second = await task.run(async () => 'second');

    expect(second).toBeNull();
    gate.resolve();
    await expect(first).resolves.toBe('first');
  });

  it('is usable again after a failure', async () => {
    const task = new ExclusiveTask();
    await expect(task.run(async () => Promise.reject(new Error('write failed')))).rejects.toThrow();

    expect(task.isRunning).toBe(false);
    await expect(task.run(async () => 'ok')).resolves.toBe('ok');
  });

  it('does not block a read guard, which is the point of separate guards', async () => {
    const gate = deferred();
    const write = new ExclusiveTask();
    let reads = 0;
    const refresh = new RefreshCoordinator(async () => {
      reads += 1;
    });

    const writing = write.run(async () => {
      await gate.promise;
      return 'written';
    });
    // A background refresh during a write must still run.
    await refresh.request();
    expect(reads).toBe(1);

    gate.resolve();
    await expect(writing).resolves.toBe('written');
  });
});
