import {
  recordMonitorCount,
  recordMonitorError,
  recordMonitorState,
  reportAlive,
  type MonitorCounterKey,
} from "../health.js";

export class MonitorTelemetry {
  constructor(private readonly monitorName: string) {}

  alive(): void {
    reportAlive(this.monitorName);
  }

  count(counter: MonitorCounterKey, amount = 1): void {
    recordMonitorCount(this.monitorName, counter, amount);
  }

  error(err: unknown, amount = 1): void {
    recordMonitorError(this.monitorName, err, amount);
  }

  state(state: string): void {
    recordMonitorState(this.monitorName, state);
  }
}
