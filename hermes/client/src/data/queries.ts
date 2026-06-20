import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type {
  Conversation,
  CreateConversationRequest,
  CursorPage,
  Message,
  ModelsResponse,
  SkillsResponse,
  ToolsetsResponse,
  UpdateProfileRequest,
  User,
} from '@hermes/shared';
import { apiRequest } from '~/api/client';
import { queryKeys } from './keys';

export function useConversations() {
  return useInfiniteQuery({
    queryKey: queryKeys.conversations,
    queryFn: ({ pageParam }) =>
      apiRequest<CursorPage<Conversation>>(
        'GET',
        `/api/conversations?limit=30${pageParam ? `&cursor=${pageParam}` : ''}`,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
}

export function useMessages(conversationId: string | null) {
  return useQuery({
    queryKey: conversationId ? queryKeys.messages(conversationId) : ['messages', 'none'],
    enabled: conversationId !== null,
    queryFn: () =>
      apiRequest<CursorPage<Message>>('GET', `/api/conversations/${conversationId}/messages?limit=100`),
  });
}

export function useProfile() {
  return useQuery({
    queryKey: queryKeys.profile,
    queryFn: () => apiRequest<User>('GET', '/api/profile'),
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateProfileRequest) => apiRequest<User>('PATCH', '/api/profile', body),
    onSuccess: (user) => {
      queryClient.setQueryData(queryKeys.profile, user);
    },
  });
}

export function useModels() {
  return useQuery({
    queryKey: queryKeys.models,
    queryFn: () => apiRequest<ModelsResponse>('GET', '/api/discovery/models'),
    staleTime: 5 * 60 * 1000,
  });
}

export function useToolsets() {
  return useQuery({
    queryKey: queryKeys.toolsets,
    queryFn: () => apiRequest<ToolsetsResponse>('GET', '/api/discovery/toolsets'),
    staleTime: 5 * 60 * 1000,
  });
}

export function useSkills() {
  return useQuery({
    queryKey: queryKeys.skills,
    queryFn: () => apiRequest<SkillsResponse>('GET', '/api/discovery/skills'),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateConversationRequest) =>
      apiRequest<Conversation>('POST', '/api/conversations', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
    },
  });
}

export function useRenameConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      apiRequest<Conversation>('PATCH', `/api/conversations/${id}`, { title }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
    },
  });
}

export function useDeleteConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiRequest<void>('DELETE', `/api/conversations/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
    },
  });
}

export function useForkConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiRequest<Conversation>('POST', `/api/conversations/${id}/fork`, {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
    },
  });
}
