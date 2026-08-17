/**
 * Host hang points for question / plan-suggest.
 * Same shape as PermissionGate: emit, wait, resolve, timeout.
 */

export interface QuestionAskInput {
  requestId: string;
  runtimeSessionId: string;
  tabId: string;
  turnId: string;
  prompt: string;
  options?: string[];
  multiSelect?: boolean;
}

export interface QuestionAskResult {
  ok: boolean;
  answer?: string;
  selected?: string[];
  cancelled?: boolean;
  reason?: string;
}

export interface PlanSuggestInput {
  requestId: string;
  runtimeSessionId: string;
  tabId: string;
  turnId: string;
  reason: string;
}

export interface PlanSuggestResult {
  accepted: boolean;
  reason?: string;
}

type Pending =
  | {
    kind: "question";
    runtimeSessionId: string;
    timer: ReturnType<typeof setTimeout>;
    resolve: (result: QuestionAskResult) => void;
  }
  | {
    kind: "plan";
    runtimeSessionId: string;
    timer: ReturnType<typeof setTimeout>;
    resolve: (result: PlanSuggestResult) => void;
  };

export class InteractionBroker {
  private readonly pending = new Map<string, Pending>();

  constructor(
    private readonly opts: {
      timeoutMs?: number;
      onQuestion?: (input: QuestionAskInput) => void;
      onPlanSuggest?: (input: PlanSuggestInput) => void;
    } = {},
  ) {}

  get timeoutMs(): number {
    return this.opts.timeoutMs ?? 120_000;
  }

  pendingCount(): number {
    return this.pending.size;
  }

  askQuestion(input: QuestionAskInput): Promise<QuestionAskResult> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(input.requestId);
        resolve({ ok: false, cancelled: true, reason: "question_timeout" });
      }, this.timeoutMs);
      this.pending.set(input.requestId, {
        kind: "question",
        runtimeSessionId: input.runtimeSessionId,
        timer,
        resolve,
      });
      this.opts.onQuestion?.(input);
    });
  }

  resolveQuestion(
    requestId: string,
    payload: { answer?: string; selected?: string[] },
  ): boolean {
    const waiter = this.pending.get(requestId);
    if (!waiter || waiter.kind !== "question") return false;
    clearTimeout(waiter.timer);
    this.pending.delete(requestId);
    const answer = payload.answer?.trim()
      ?? payload.selected?.filter(Boolean).join(", ");
    waiter.resolve({
      ok: Boolean(answer),
      answer,
      selected: payload.selected,
    });
    return true;
  }

  suggestPlan(input: PlanSuggestInput): Promise<PlanSuggestResult> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(input.requestId);
        resolve({ accepted: false, reason: "plan_suggest_timeout" });
      }, this.timeoutMs);
      this.pending.set(input.requestId, {
        kind: "plan",
        runtimeSessionId: input.runtimeSessionId,
        timer,
        resolve,
      });
      this.opts.onPlanSuggest?.(input);
    });
  }

  resolvePlanSuggest(requestId: string, decision: "accept" | "dismiss"): boolean {
    const waiter = this.pending.get(requestId);
    if (!waiter || waiter.kind !== "plan") return false;
    clearTimeout(waiter.timer);
    this.pending.delete(requestId);
    waiter.resolve({
      accepted: decision === "accept",
      reason: decision === "accept" ? "user_accept" : "user_dismiss",
    });
    return true;
  }

  cancelSession(runtimeSessionId: string): number {
    let n = 0;
    for (const [id, waiter] of [...this.pending.entries()]) {
      if (waiter.runtimeSessionId !== runtimeSessionId) continue;
      clearTimeout(waiter.timer);
      this.pending.delete(id);
      if (waiter.kind === "question") {
        waiter.resolve({ ok: false, cancelled: true, reason: "cancelled" });
      } else {
        waiter.resolve({ accepted: false, reason: "cancelled" });
      }
      n += 1;
    }
    return n;
  }
}
