// =============================================================================
// SSE parser helper — extracts typed events from a text/event-stream buffer
// =============================================================================

/**
 * Parse buffered SSE text, invoking `onEvent` for each complete event frame.
 * Returns the unconsumed remainder (partial frame still buffering).
 */
export function parseSSEBuffer(
  buffer: string,
  onEvent: (eventType: string, data: string) => void,
): string {
  let remaining = buffer;
  let boundary: number;
  while ((boundary = remaining.indexOf("\n\n")) !== -1) {
    const raw = remaining.slice(0, boundary);
    remaining = remaining.slice(boundary + 2);
    let eventType = "";
    let eventData = "";
    for (const line of raw.split("\n")) {
      if (line.startsWith("event: ")) eventType = line.slice(7);
      else if (line.startsWith("data: ")) eventData = line.slice(6);
    }
    if (eventType && eventData) {
      onEvent(eventType, eventData);
    }
  }
  return remaining;
}
