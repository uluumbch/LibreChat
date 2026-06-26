import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type {
  AdminAnalytics,
  AdminJob,
  AdminJobsResponse,
  AdminOverview,
  AdminUser,
  AdminUserDetail,
  AdminUsersResponse,
  Conversation,
  ConversationUsage,
  CreateConversationRequest,
  AdminComposioToolkitsResponse,
  AdminLlmProvider,
  AdminLlmProvidersResponse,
  AdminSlashCommand,
  AdminSlashCommandsResponse,
  ComposioConnectResponse,
  ComposioToolkitsResponse,
  CreateJobRequest,
  UpsertLlmModelRequest,
  UpsertLlmProviderRequest,
  UpsertSlashCommandRequest,
  UserSlashCommandsResponse,
  CreateMcpServerRequest,
  CursorPage,
  InviteUserRequest,
  McpServersResponse,
  JobsResponse,
  JobSummary,
  Message,
  ModelsResponse,
  SearchResponse,
  SkillsResponse,
  ToolsetsResponse,
  TopupRequest,
  UpdateProfileRequest,
  UpdateUserRequest,
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

export function useConversationUsage(conversationId: string | null) {
  return useQuery({
    queryKey: conversationId ? queryKeys.usage(conversationId) : ['usage', 'none'],
    enabled: conversationId !== null,
    queryFn: () =>
      apiRequest<ConversationUsage>('GET', `/api/conversations/${conversationId}/usage`),
    staleTime: 15 * 1000,
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

export function useJobs() {
  return useQuery({
    queryKey: queryKeys.jobs,
    queryFn: () => apiRequest<JobsResponse>('GET', '/api/jobs'),
    staleTime: 30 * 1000,
  });
}

export function useCreateJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateJobRequest) => apiRequest<JobSummary>('POST', '/api/jobs', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.jobs });
    },
  });
}

export function useDeleteJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiRequest<void>('DELETE', `/api/jobs/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.jobs });
    },
  });
}

export function useJobAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'pause' | 'resume' | 'run' }) =>
      apiRequest<JobSummary>('POST', `/api/jobs/${id}/${action}`, {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.jobs });
    },
  });
}

export function useSearch(query: string) {
  const term = query.trim();
  return useQuery({
    queryKey: queryKeys.search(term),
    enabled: term.length >= 2,
    queryFn: () =>
      apiRequest<SearchResponse>('GET', `/api/conversations/search?q=${encodeURIComponent(term)}`),
    staleTime: 30 * 1000,
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

/* ------------------------------- Admin ------------------------------- */

export function useAdminOverview() {
  return useQuery({
    queryKey: queryKeys.adminOverview,
    queryFn: () => apiRequest<AdminOverview>('GET', '/api/admin/overview'),
    staleTime: 30 * 1000,
  });
}

export function useAdminAnalytics(days: number) {
  return useQuery({
    queryKey: queryKeys.adminAnalytics(days),
    queryFn: () => apiRequest<AdminAnalytics>('GET', `/api/admin/analytics?days=${days}`),
    staleTime: 30 * 1000,
  });
}

export function useAdminUsers(query: string) {
  const term = query.trim();
  return useQuery({
    queryKey: queryKeys.adminUsers(term),
    queryFn: () =>
      apiRequest<AdminUsersResponse>(
        'GET',
        `/api/admin/users${term ? `?q=${encodeURIComponent(term)}` : ''}`,
      ),
    staleTime: 15 * 1000,
  });
}

export function useAdminUser(id: string | null) {
  return useQuery({
    queryKey: id ? queryKeys.adminUser(id) : ['admin', 'user', 'none'],
    enabled: id !== null,
    queryFn: () => apiRequest<AdminUserDetail>('GET', `/api/admin/users/${id}`),
  });
}

/** Invalidate every admin list/detail after a mutation that can shift balances or status. */
function invalidateAdmin(queryClient: ReturnType<typeof useQueryClient>): void {
  void queryClient.invalidateQueries({ queryKey: ['admin'] });
}

export function useUpdateAdminUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateUserRequest }) =>
      apiRequest<AdminUser>('PATCH', `/api/admin/users/${id}`, body),
    onSuccess: () => invalidateAdmin(queryClient),
  });
}

export function useTopupUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, amount }: { id: string } & TopupRequest) =>
      apiRequest<AdminUser>('POST', `/api/admin/users/${id}/topup`, { amount }),
    onSuccess: () => invalidateAdmin(queryClient),
  });
}

export function useInviteUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: InviteUserRequest) =>
      apiRequest<AdminUser>('POST', '/api/admin/invite', body),
    onSuccess: () => invalidateAdmin(queryClient),
  });
}

export function useAdminJobs() {
  return useQuery({
    queryKey: queryKeys.adminJobs,
    queryFn: () => apiRequest<AdminJobsResponse>('GET', '/api/admin/jobs'),
    staleTime: 30 * 1000,
  });
}

export function useAdminJobAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'pause' | 'resume' | 'run' }) =>
      apiRequest<AdminJob>('POST', `/api/admin/jobs/${id}/${action}`, {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminJobs });
    },
  });
}

export function useMcpServers() {
  return useQuery({
    queryKey: queryKeys.adminMcp,
    queryFn: () => apiRequest<McpServersResponse>('GET', '/api/admin/mcp-servers'),
    staleTime: 15 * 1000,
  });
}

/** After an MCP change, refresh both the MCP list and the toolset catalog (so the
 *  UserDrawer per-user toggles pick up the new/removed server). */
function invalidateMcp(queryClient: ReturnType<typeof useQueryClient>): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.adminMcp });
  void queryClient.invalidateQueries({ queryKey: queryKeys.toolsets });
  void queryClient.invalidateQueries({ queryKey: ['admin'] });
}

export function useCreateMcpServer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateMcpServerRequest) =>
      apiRequest<{ name: string; connected: boolean }>('POST', '/api/admin/mcp-servers', body),
    onSuccess: () => invalidateMcp(queryClient),
  });
}

export function useDeleteMcpServer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      apiRequest<void>('DELETE', `/api/admin/mcp-servers/${encodeURIComponent(name)}`),
    onSuccess: () => invalidateMcp(queryClient),
  });
}

/* --------------------------- First-party LLM providers --------------------------- */

export function useAdminLlmProviders() {
  return useQuery({
    queryKey: queryKeys.adminLlm,
    queryFn: () => apiRequest<AdminLlmProvidersResponse>('GET', '/api/admin/llm/providers'),
    staleTime: 15 * 1000,
  });
}

/** After any provider/model change, refresh the catalog AND the admin branch so an open
 *  UserDrawer's grantable list (detail.llmCatalog) reflects the new enabled set. */
function invalidateLlm(queryClient: ReturnType<typeof useQueryClient>): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.adminLlm });
  void queryClient.invalidateQueries({ queryKey: ['admin'] });
}

export function useCreateLlmProvider() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpsertLlmProviderRequest) =>
      apiRequest<AdminLlmProvider>('POST', '/api/admin/llm/providers', body),
    onSuccess: () => invalidateLlm(queryClient),
  });
}

export function useUpdateLlmProvider() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<UpsertLlmProviderRequest> }) =>
      apiRequest<AdminLlmProvider>('PATCH', `/api/admin/llm/providers/${id}`, body),
    onSuccess: () => invalidateLlm(queryClient),
  });
}

export function useDeleteLlmProvider() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiRequest<void>('DELETE', `/api/admin/llm/providers/${id}`),
    onSuccess: () => invalidateLlm(queryClient),
  });
}

export function useCreateLlmModel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ providerId, body }: { providerId: string; body: UpsertLlmModelRequest }) =>
      apiRequest('POST', `/api/admin/llm/providers/${providerId}/models`, body),
    onSuccess: () => invalidateLlm(queryClient),
  });
}

export function useUpdateLlmModel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ slug, body }: { slug: string; body: Partial<Omit<UpsertLlmModelRequest, 'slug'>> }) =>
      apiRequest('PATCH', `/api/admin/llm/models/${encodeURIComponent(slug)}`, body),
    onSuccess: () => invalidateLlm(queryClient),
  });
}

export function useDeleteLlmModel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (slug: string) =>
      apiRequest<void>('DELETE', `/api/admin/llm/models/${encodeURIComponent(slug)}`),
    onSuccess: () => invalidateLlm(queryClient),
  });
}

/* --------------------------- Composio (third-party apps) --------------------------- */

export function useComposioAdminToolkits(query: string) {
  return useQuery({
    queryKey: queryKeys.adminComposio(query),
    queryFn: () =>
      apiRequest<AdminComposioToolkitsResponse>(
        'GET',
        `/api/admin/composio/toolkits${query ? `?q=${encodeURIComponent(query)}` : ''}`,
      ),
    staleTime: 15 * 1000,
  });
}

export function useToggleComposioToolkit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { slug: string; enabled: boolean; name?: string }) =>
      apiRequest<{ slug: string; enabled: boolean; disconnected: number; revokedFrom: number }>(
        'PATCH',
        `/api/admin/composio/toolkits/${encodeURIComponent(vars.slug)}`,
        { enabled: vars.enabled, name: vars.name },
      ),
    // Refresh the catalog AND the admin branch so an open UserDrawer's grantable
    // list (detail.composioCatalog) reflects the new enabled set.
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'composio'] });
      void queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
  });
}

export function useComposioToolkits() {
  return useQuery({
    queryKey: queryKeys.composioToolkits,
    queryFn: () => apiRequest<ComposioToolkitsResponse>('GET', '/api/composio/toolkits'),
    staleTime: 15 * 1000,
  });
}

export function useConnectComposio() {
  return useMutation({
    mutationFn: (toolkit: string) =>
      apiRequest<ComposioConnectResponse>(
        'POST',
        `/api/composio/connections/${encodeURIComponent(toolkit)}`,
      ),
  });
}

export function useDisconnectComposio() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (toolkit: string) =>
      apiRequest<void>('DELETE', `/api/composio/connections/${encodeURIComponent(toolkit)}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.composioToolkits });
    },
  });
}

/* --------------------------- Slash commands (curated) --------------------------- */

/** The curated commands available to the signed-in user — drives the composer autocomplete. */
export function useCommands() {
  return useQuery({
    queryKey: queryKeys.commands,
    queryFn: () => apiRequest<UserSlashCommandsResponse>('GET', '/api/commands'),
    staleTime: 30 * 1000,
  });
}

export function useAdminCommands() {
  return useQuery({
    queryKey: queryKeys.adminCommands,
    queryFn: () => apiRequest<AdminSlashCommandsResponse>('GET', '/api/admin/commands'),
    staleTime: 15 * 1000,
  });
}

/** After a catalog change, refresh the admin catalog, the admin branch (open UserDrawer
 *  grant list), and the per-user command list. */
function invalidateCommands(queryClient: ReturnType<typeof useQueryClient>): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.adminCommands });
  void queryClient.invalidateQueries({ queryKey: ['admin'] });
  void queryClient.invalidateQueries({ queryKey: queryKeys.commands });
}

export function useUpsertSlashCommand() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpsertSlashCommandRequest) =>
      apiRequest<AdminSlashCommand>('POST', '/api/admin/commands', body),
    onSuccess: () => invalidateCommands(queryClient),
  });
}

export function useDeleteSlashCommand() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiRequest<void>('DELETE', `/api/admin/commands/${id}`),
    onSuccess: () => invalidateCommands(queryClient),
  });
}
