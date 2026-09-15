import apiClient from './client'

// ─── Friend Requests ────────────────────────────────────────────────

export interface FriendRequestData {
  id: number
  sender_id: number
  receiver_id: number
  sender_name: string
  sender_username: string
  sender_avatar: string | null
  receiver_name: string
  receiver_username: string
  receiver_avatar: string | null
  status: string
  message: string | null
  created_at: string
}

export const sendFriendRequest = async (receiverId: number, message?: string): Promise<FriendRequestData> => {
  const res = await apiClient.post('/chat/friend-request', { receiver_id: receiverId, message })
  return res.data
}

export const fetchFriendRequests = async (
  direction: 'received' | 'sent' | 'all' = 'received',
  status?: string
): Promise<{ items: FriendRequestData[]; total: number }> => {
  const params: any = { direction }
  if (status) params.status = status
  const res = await apiClient.get('/chat/friend-requests', { params })
  return res.data
}

export const acceptFriendRequest = async (id: number): Promise<FriendRequestData> => {
  const res = await apiClient.put(`/chat/friend-request/${id}/accept`)
  return res.data
}

export const rejectFriendRequest = async (id: number): Promise<FriendRequestData> => {
  const res = await apiClient.put(`/chat/friend-request/${id}/reject`)
  return res.data
}

export const fetchFriends = async (): Promise<any[]> => {
  const res = await apiClient.get('/chat/friends')
  return res.data
}

// ─── Direct Messages ────────────────────────────────────────────────

export interface DirectMessageData {
  id: number
  sender_id: number
  receiver_id: number
  content: string
  message_type: string
  file_url: string | null
  file_name: string | null
  file_size: number | null
  file_type: string | null
  created_at: string
  read_at: string | null
}

export interface MessagePage<T> {
  items: T[]
  total: number
  /** Whether there are older messages than the first one returned. */
  has_more: boolean
}

/** The newest messages with a friend, oldest first. Pass beforeId to page back. */
export const fetchDirectMessages = async (
  userId: number,
  { limit = 50, beforeId }: { limit?: number; beforeId?: number } = {},
): Promise<MessagePage<DirectMessageData>> => {
  const params: Record<string, number> = { limit }
  if (beforeId) params.before_id = beforeId
  const res = await apiClient.get(`/chat/messages/${userId}`, { params })
  return res.data
}

export interface OutgoingMessage {
  content: string
  message_type: 'text' | 'file'
  file_url?: string | null
  file_name?: string | null
  file_size?: number | null
  file_type?: string | null
}

/** Send a direct message. Resolves with the saved message, or rejects with why it was not sent. */
export const sendDirectMessage = async (userId: number, message: OutgoingMessage): Promise<DirectMessageData> => {
  const res = await apiClient.post(`/chat/messages/${userId}`, message)
  return res.data
}

/** Mark what a friend sent as read, for messages that arrive while the conversation is open. */
export const markConversationRead = async (userId: number): Promise<void> => {
  await apiClient.post(`/chat/messages/${userId}/read`)
}

export const fetchUnreadCounts = async (): Promise<Record<string, number>> => {
  const res = await apiClient.get('/chat/unread-counts')
  return res.data
}

// ─── File Upload ─────────────────────────────────────────────────────

export interface ChatFileUploadResponse {
  file_url: string
  file_name: string
  file_size: number
  file_type: string
}

export const uploadChatFile = async (file: File): Promise<ChatFileUploadResponse> => {
  const formData = new FormData()
  formData.append('file', file)
  const res = await apiClient.post('/chat/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return res.data
}

const chatFileName = (fileUrl: string): string => {
  const path = fileUrl.split('?', 1)[0].replace(/\\/g, '/')
  const name = path.split('/').filter(Boolean).pop()
  if (!name) throw new Error('Invalid chat file reference')
  return name
}

export const fetchChatFile = async (fileUrl: string): Promise<Blob> => {
  const res = await apiClient.get(`/chat/files/${encodeURIComponent(chatFileName(fileUrl))}`, {
    responseType: 'blob',
  })
  return res.data
}

export const downloadChatFile = async (fileUrl: string, fileName?: string | null): Promise<void> => {
  const blob = await fetchChatFile(fileUrl)
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = fileName || chatFileName(fileUrl)
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000)
}

// ─── Workspaces ──────────────────────────────────────────────────────

export interface WorkspaceMemberData {
  id: number
  workspace_id: number
  user_id: number
  username: string
  full_name: string
  avatar_url: string | null
  role: string
  joined_at: string
}

export interface WorkspaceData {
  id: number
  name: string
  description: string | null
  avatar_url: string | null
  created_by: number | null
  created_at: string
  updated_at: string
  members: WorkspaceMemberData[]
  member_count: number
}

export const createWorkspace = async (
  name: string,
  description?: string,
  memberIds?: number[]
): Promise<WorkspaceData> => {
  const res = await apiClient.post('/chat/workspaces', {
    name,
    description,
    member_ids: memberIds,
  })
  return res.data
}

export const fetchWorkspaces = async (): Promise<{ items: WorkspaceData[]; total: number }> => {
  const res = await apiClient.get('/chat/workspaces')
  return res.data
}

export const fetchWorkspace = async (id: number): Promise<WorkspaceData> => {
  const res = await apiClient.get(`/chat/workspaces/${id}`)
  return res.data
}

export const addWorkspaceMember = async (workspaceId: number, userId: number): Promise<WorkspaceMemberData> => {
  const res = await apiClient.post(`/chat/workspaces/${workspaceId}/members`, { user_id: userId })
  return res.data
}

export const removeWorkspaceMember = async (workspaceId: number, userId: number): Promise<void> => {
  await apiClient.delete(`/chat/workspaces/${workspaceId}/members/${userId}`)
}

// ─── Workspace Messages ─────────────────────────────────────────────

export interface WorkspaceMessageData {
  id: number
  workspace_id: number
  sender_id: number
  sender_name: string
  sender_avatar: string | null
  content: string
  message_type: string
  file_url: string | null
  file_name: string | null
  file_size: number | null
  file_type: string | null
  created_at: string
}

/** The newest messages in a workspace, oldest first. Pass beforeId to page back. */
export const fetchWorkspaceMessages = async (
  workspaceId: number,
  { limit = 50, beforeId }: { limit?: number; beforeId?: number } = {},
): Promise<MessagePage<WorkspaceMessageData>> => {
  const params: Record<string, number> = { limit }
  if (beforeId) params.before_id = beforeId
  const res = await apiClient.get(`/chat/workspaces/${workspaceId}/messages`, { params })
  return res.data
}

export const sendWorkspaceMessage = async (
  workspaceId: number, message: OutgoingMessage,
): Promise<WorkspaceMessageData> => {
  const res = await apiClient.post(`/chat/workspaces/${workspaceId}/messages`, message)
  return res.data
}
