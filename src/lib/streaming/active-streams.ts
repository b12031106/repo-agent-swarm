/**
 * Global registry of active SSE streams.
 * Used by the cleanup module to avoid deleting conversations with active streams.
 */
const _activeStreams = new Set<string>();

export function registerActiveStream(conversationId: string) {
  _activeStreams.add(conversationId);
}

export function unregisterActiveStream(conversationId: string) {
  _activeStreams.delete(conversationId);
}

export function getActiveStreamIds(): Set<string> {
  return new Set(_activeStreams);
}
