export class MetaRequestPacer {
  constructor({ minIntervalMs = 1500, now = Date.now, sleep = wait } = {}) {
    this.minIntervalMs = Math.max(250, Number(minIntervalMs) || 1500);
    this.now = now;
    this.sleep = sleep;
    this.queue = Promise.resolve();
    this.nextAllowedAt = 0;
    this.lastUsage = null;
  }

  recordUsage(value) {
    this.lastUsage = { value: Number(value) || 0, at: this.now() };
  }

  getUsage() {
    return this.lastUsage;
  }

  run(operation) {
    const scheduled = this.queue.then(async () => {
      const delay = Math.max(0, this.nextAllowedAt - this.now());
      if (delay) await this.sleep(delay);
      try { return await operation(); }
      finally { this.nextAllowedAt = this.now() + this.minIntervalMs; }
    });
    this.queue = scheduled.catch(() => {});
    return scheduled;
  }

  cooldown(milliseconds) {
    this.nextAllowedAt = Math.max(this.nextAllowedAt, this.now() + Math.max(0, Number(milliseconds) || 0));
  }
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
