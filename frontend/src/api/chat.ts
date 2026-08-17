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

export const fetchDirectMessages = async (
  userId: number,
  skip = 0,
  limit = 50
): Promise<{ items: DirectMessageData[]; total: number }> => {
  const res = await apiClient.get(`/chat/messages/${userId}`, { params: { skip, limit } })
  return res.data
}

export const sendDirectMessage = async (
  userId: number,
  content: string,
  messageType = 'text'
): Promise<DirectMessageData> => {
  const res = await apiClient.post(`/chat/messages/${userId}`, { content, message_type: messageType })
  return res.data
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

export const fetchWorkspaceMessages = async (
  workspaceId: number,
  skip = 0,
  limit = 50
): Promise<{ items: WorkspaceMessageData[]; total: number }> => {
  const res = await apiClient.get(`/chat/workspaces/${workspaceId}/messages`, { params: { skip, limit } })
  return res.data
}

export const sendWorkspaceMessage = async (
  workspaceId: number,
  content: string,
  messageType = 'text'
): Promise<WorkspaceMessageData> => {
  const res = await apiClient.post(`/chat/workspaces/${workspaceId}/messages`, {
    content,
    message_type: messageType,
  })
  return res.data
}
