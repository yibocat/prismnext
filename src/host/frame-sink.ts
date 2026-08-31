import type { AgentEventSink } from "../shared/remote";
import type { HostHandlerContext } from "./context";

export function createFrameSink(ctx: HostHandlerContext): AgentEventSink {
  return {
    emit(channel, payload) {
      ctx.emit(channel, payload);
    },
  };
}
