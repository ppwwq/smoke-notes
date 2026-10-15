export const BACKGROUND_LAUNCH_ARGUMENT = "--background";

interface SingleInstanceApp {
  requestSingleInstanceLock(): boolean;
  quit(): void;
  on(event: "second-instance", listener: () => void): unknown;
}

export function registerSingleInstance(
  app: SingleInstanceApp,
  activateExistingInstance: () => void,
): boolean {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return false;
  }

  app.on("second-instance", activateExistingInstance);
  return true;
}

export function shouldShowMainWindow(argv: readonly string[]): boolean {
  return !argv.includes(BACKGROUND_LAUNCH_ARGUMENT);
}

export interface QuitParticipant {
  id: number;
  prepare(requestId: number): void;
  cancel(requestId: number, message: string): void;
}

// A renderer remains locked after acknowledging until either quit or cancel.
// Never force a quit on timeout: its draft may still exist only in memory.
export class SaveBeforeQuit {
  private sequence = 0;
  private attempt?: {
    id: number;
    participants: QuitParticipant[];
    pending: Set<number>;
    timer: ReturnType<typeof setTimeout>;
    resolve(saved: boolean): void;
    promise: Promise<boolean>;
  };

  constructor(
    private readonly participants: () => QuitParticipant[],
    private readonly quit: () => void,
    private readonly timeoutMs = 30_000,
  ) {}

  get preparing() {
    return !!this.attempt;
  }

  request(): Promise<boolean> {
    if (this.attempt) return this.attempt.promise;
    const participants = [...this.participants()];
    const id = ++this.sequence;
    let resolve!: (saved: boolean) => void;
    const promise = new Promise<boolean>((done) => {
      resolve = done;
    });
    this.attempt = {
      id,
      participants,
      pending: new Set(participants.map((item) => item.id)),
      timer: setTimeout(
        () => this.cancel("保存等待超时，退出已取消。请完成输入或重试。"),
        this.timeoutMs,
      ),
      resolve,
      promise,
    };
    try {
      for (const participant of participants) {
        if (this.attempt?.id !== id) break;
        participant.prepare(id);
      }
      this.finishIfReady();
    } catch {
      this.cancel("无法确认全部窗口已保存，退出已取消，请重试。");
    }
    return promise;
  }

  acknowledge(requestId: number, participantId: number, saved: boolean) {
    const attempt = this.attempt;
    if (attempt?.id !== requestId || !attempt.pending.has(participantId))
      return;
    if (!saved) {
      this.cancel("便签保存失败，退出已取消。草稿仍保留，请重试。");
      return;
    }
    attempt.pending.delete(participantId);
    this.finishIfReady();
  }

  private finishIfReady() {
    const attempt = this.attempt;
    if (!attempt || attempt.pending.size) return;
    const ids = new Set(attempt.participants.map((item) => item.id));
    if (this.participants().some((item) => !ids.has(item.id))) {
      this.cancel("仍有窗口正在打开，退出已取消，请稍后重试。");
      return;
    }
    try {
      this.quit();
      clearTimeout(attempt.timer);
      this.attempt = undefined;
      attempt.resolve(true);
    } catch {
      this.cancel("无法完成退出，草稿仍保留，请稍后重试。");
    }
  }

  cancel(message: string) {
    const attempt = this.attempt;
    if (!attempt) return;
    clearTimeout(attempt.timer);
    this.attempt = undefined;
    for (const participant of attempt.participants) {
      try {
        participant.cancel(attempt.id, message);
      } catch {
        /* Other windows must unlock too. */
      }
    }
    attempt.resolve(false);
  }
}
