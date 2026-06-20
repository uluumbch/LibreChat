export const queryKeys = {
  conversations: ['conversations'] as const,
  conversation: (id: string) => ['conversation', id] as const,
  messages: (id: string) => ['messages', id] as const,
  profile: ['profile'] as const,
  models: ['models'] as const,
  toolsets: ['toolsets'] as const,
  skills: ['skills'] as const,
};
