import { describe, test, expect } from "bun:test";
import { parseSSEBuffer } from "@/app/(dashboard)/watchlist/_lib/sse";

// =============================================================================
// parseSSEBuffer — client-side SSE frame parser
// =============================================================================

describe("parseSSEBuffer", () => {
  test("parses a single complete event", () => {
    const events: { type: string; data: string }[] = [];
    const remainder = parseSSEBuffer(
      'event: translated\ndata: {"id":1}\n\n',
      (type, data) => events.push({ type, data }),
    );
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("translated");
    expect(events[0]!.data).toBe('{"id":1}');
    expect(remainder).toBe("");
  });

  test("parses multiple events in one buffer", () => {
    const events: { type: string; data: string }[] = [];
    const buffer =
      'event: start\ndata: {"total":5}\n\n' +
      'event: translating\ndata: {"postId":1}\n\n' +
      'event: translated\ndata: {"postId":1,"current":1}\n\n';

    const remainder = parseSSEBuffer(buffer, (type, data) =>
      events.push({ type, data }),
    );

    expect(events).toHaveLength(3);
    expect(events[0]!.type).toBe("start");
    expect(events[1]!.type).toBe("translating");
    expect(events[2]!.type).toBe("translated");
    expect(remainder).toBe("");
  });

  test("returns unconsumed partial frame as remainder", () => {
    const events: { type: string; data: string }[] = [];
    const remainder = parseSSEBuffer(
      'event: done\ndata: {"ok":true}\n\nevent: partial\ndata: {"inc',
      (type, data) => events.push({ type, data }),
    );

    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("done");
    // The incomplete second event remains in the buffer
    expect(remainder).toBe('event: partial\ndata: {"inc');
  });

  test("accumulates across multiple calls (chunked streaming)", () => {
    const events: { type: string; data: string }[] = [];
    const cb = (type: string, data: string) => events.push({ type, data });

    // Chunk 1: incomplete
    let buf = parseSSEBuffer('event: start\ndata: {"to', cb);
    expect(events).toHaveLength(0);
    expect(buf).toBe('event: start\ndata: {"to');

    // Chunk 2: completes the first event, starts another
    buf = parseSSEBuffer(buf + 'tal":3}\n\nevent: translat', cb);
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("start");
    expect(JSON.parse(events[0]!.data)).toEqual({ total: 3 });
    expect(buf).toBe("event: translat");

    // Chunk 3: completes the second event
    buf = parseSSEBuffer(buf + 'ing\ndata: {"postId":1}\n\n', cb);
    expect(events).toHaveLength(2);
    expect(events[1]!.type).toBe("translating");
    expect(buf).toBe("");
  });

  test("skips frames missing event type", () => {
    const events: { type: string; data: string }[] = [];
    // Frame with only data, no event line
    const remainder = parseSSEBuffer(
      'data: {"orphan":true}\n\nevent: ok\ndata: {"valid":true}\n\n',
      (type, data) => events.push({ type, data }),
    );
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("ok");
    expect(remainder).toBe("");
  });

  test("skips frames missing data", () => {
    const events: { type: string; data: string }[] = [];
    const remainder = parseSSEBuffer(
      'event: empty\n\nevent: ok\ndata: {"v":1}\n\n',
      (type, data) => events.push({ type, data }),
    );
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("ok");
    expect(remainder).toBe("");
  });

  test("handles empty buffer", () => {
    const events: { type: string; data: string }[] = [];
    const remainder = parseSSEBuffer("", (type, data) =>
      events.push({ type, data }),
    );
    expect(events).toHaveLength(0);
    expect(remainder).toBe("");
  });

  test("handles buffer with only whitespace / no complete frames", () => {
    const events: { type: string; data: string }[] = [];
    const remainder = parseSSEBuffer("event: pending\n", (type, data) =>
      events.push({ type, data }),
    );
    expect(events).toHaveLength(0);
    expect(remainder).toBe("event: pending\n");
  });
});
