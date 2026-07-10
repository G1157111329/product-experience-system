type AgentUser = { id: string; role: string };
type ConversationOwner = { platformUserId?: string | null };

export function canAccessConversationRow(user: AgentUser, conversation: ConversationOwner): boolean {
  return user.role === 'admin' || Boolean(conversation.platformUserId && conversation.platformUserId === user.id);
}
