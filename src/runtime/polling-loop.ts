export interface PollingLoopOptions {
  intervalMs: number;
  run: () => Promise<void>;
  onError?: (err: unknown) => void | Promise<void>;
}

export class PollingLoop {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private inFlight = false;

  constructor(private readonly options: PollingLoopOptions) {}

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    await this.runOnce();
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private scheduleNext(): void {
    if (!this.running) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.runOnce();
    }, this.options.intervalMs);
  }

  private async runOnce(): Promise<void> {
    if (!this.running || this.inFlight) return;

    this.inFlight = true;
    try {
      await this.options.run();
    } catch (err) {
      if (this.options.onError) {
        try {
          await this.options.onError(err);
        } catch {
          /* ignore secondary error */
        }
      }
    } finally {
      this.inFlight = false;
      this.scheduleNext();
    }
  }
}
