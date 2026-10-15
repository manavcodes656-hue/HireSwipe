import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';
import { Database } from '../models/database.types';

type MessageRow = Database['public']['Tables']['messages']['Row'];
type ConversationRow = Database['public']['Tables']['conversations']['Row'];

/**
 * MessagesService — manages conversations, conversation_members, and messages.
 *
 * SECURITY: RLS ensures only conversation members can read/send messages.
 * Users can NEVER read conversations they are not a member of.
 *
 * Conversations are auto-created by the create_conversation_for_match trigger.
 * This service focuses on reading and sending messages.
 */
@Injectable({
  providedIn: 'root',
})
export class MessagesService {
  private readonly supabase = inject(SupabaseService);

  /**
   * Get all conversations for the current user.
   * RLS ensures only conversations where the user is a member are returned.
   */
  async getConversations(profileId: string): Promise<any[]> {
    const { data, error } = await this.supabase.client
      .from('conversation_members')
      .select('conversation_id, conversations(id, match_id, updated_at, matches(job_id, jobs(title), companies(name, logo_url)))')
      .eq('profile_id', profileId)
      .order('conversation_id');
    if (error) console.error('[MessagesService] getConversations:', error.message);
    return (data ?? []) as any;
  }

  /**
   * Get messages for a conversation.
   * Only members of the conversation can read these (RLS enforced).
   */
  async getMessages(conversationId: string): Promise<(MessageRow & { sender: any })[]> {
    const { data, error } = await this.supabase.client
      .from('messages')
      .select('*, profiles(full_name, avatar_url)')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
    if (error) console.error('[MessagesService] getMessages:', error.message);
    return (data ?? []) as any;
  }

  /**
   * Send a message. Sender must be a conversation member (RLS enforced).
   */
  async sendMessage(
    conversationId: string,
    senderId: string,
    message: string,
    messageType: MessageRow['message_type'] = 'text'
  ): Promise<{ data: MessageRow | null; error: string | null }> {
    const { data, error } = await this.supabase.client
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id: senderId,
        message,
        message_type: messageType,
        is_read: false,
      })
      .select()
      .single();
    if (error) return { data: null, error: error.message };
    return { data, error: null };
  }

  /**
   * Upload a message attachment and send a file message.
   */
  async sendFileMessage(
    conversationId: string,
    senderId: string,
    file: File
  ): Promise<{ error: string | null }> {
    const filePath = `${conversationId}/${Date.now()}_${file.name}`;

    const { error: storageError } = await this.supabase.client.storage
      .from('message-attachments')
      .upload(filePath, file);

    if (storageError) return { error: storageError.message };

    const { data: urlData } = this.supabase.client.storage
      .from('message-attachments')
      .getPublicUrl(filePath);

    const { error } = await this.supabase.client.from('messages').insert({
      conversation_id: conversationId,
      sender_id: senderId,
      message: urlData.publicUrl,
      message_type: 'file',
      is_read: false,
    });
    if (error) return { error: error.message };
    return { error: null };
  }

  /**
   * Mark all messages in a conversation as read for the current user.
   */
  async markConversationRead(conversationId: string): Promise<void> {
    await this.supabase.client
      .from('messages')
      .update({ is_read: true })
      .eq('conversation_id', conversationId)
      .eq('is_read', false);
  }

  /**
   * Subscribe to real-time new messages in a conversation.
   * Returns an unsubscribe function.
   */
  subscribeToMessages(
    conversationId: string,
    onMessage: (message: MessageRow) => void
  ): () => void {
    const channel = this.supabase.client
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => onMessage(payload.new as MessageRow)
      )
      .subscribe();

    return () => {
      this.supabase.client.removeChannel(channel);
    };
  }
}
