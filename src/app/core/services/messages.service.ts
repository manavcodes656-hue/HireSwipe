import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { SupabaseService } from '../supabase/supabase.service';
import { AuthService } from './auth.service';
import { Database } from '../models/database.types';
import { environment } from '../../../environments/environment';

type MessageRow = Database['public']['Tables']['messages']['Row'];
type ConversationRow = Database['public']['Tables']['conversations']['Row'];

/** A conversation as returned by the company API. */
export interface CompanyConversation {
  id: string;
  match_id: string;
  created_at: string;
  updated_at: string;
  company_id: string | null;
  job_seeker_id: string | null;
  job: { id: string; title: string; location?: string | null } | null;
  candidate: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
    headline: string | null;
  } | null;
  participant_ids: string[];
  last_message: {
    id: string;
    message: string;
    sender_id: string;
    created_at: string;
  } | null;
  last_message_at: string | null;
  unread_count: number;
}

/** A message as returned by the company API (row plus its sender). */
export interface CompanyMessage extends MessageRow {
  profiles?: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
    role: string | null;
  } | null;
}

export interface CompanyConversationsResponse {
  status: string;
  conversations: CompanyConversation[];
}

export interface CompanyConversationResponse {
  status: string;
  conversation: CompanyConversation;
  messages: CompanyMessage[];
}

export interface CompanyMessageResponse {
  status: string;
  message: CompanyMessage;
}

/** Optional filters supported by GET /api/company/conversations. */
export interface CompanyConversationFilters {
  jobId?: string;
  /** The candidate's profile id or their job seeker profile id. */
  candidateId?: string;
}

/**
 * MessagesService — manages conversations, conversation_members, and messages.
 *
 * SECURITY: RLS ensures only conversation members can read/send messages.
 * Users can NEVER read conversations they are not a member of.
 *
 * Conversations are auto-created by the create_conversation_for_match trigger.
 * This service focuses on reading and sending messages.
 *
 * Company-side operations run through the Express backend:
 * - GET  /api/company/conversations
 * - GET  /api/company/conversations/:conversationId
 * - POST /api/company/conversations/:conversationId/messages
 *
 * The candidate-side operations and the Realtime subscription stay on the
 * direct Supabase client: Realtime is a Supabase feature and does not travel
 * through Express, and the RLS policies still decide which rows it delivers.
 */
@Injectable({
  providedIn: 'root',
})
export class MessagesService {
  private readonly supabase = inject(SupabaseService);
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);

  private readonly apiUrl = environment.apiUrl || 'http://localhost:3000/api';

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async getAuthHeaders(): Promise<HttpHeaders> {
    const token = await this.authService.getAccessToken();
    let headers = new HttpHeaders({ 'Content-Type': 'application/json' });
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    return headers;
  }

  // ── Company Conversations (Express backend) ───────────────────────────────

  /**
   * Get the conversations of the companies the caller belongs to.
   * Calls Express backend GET /api/company/conversations.
   *
   * The company is derived by the backend from the caller's verified
   * membership, so it is never sent and never trusted.
   */
  async getCompanyConversations(
    filters?: CompanyConversationFilters
  ): Promise<CompanyConversation[]> {
    try {
      const headers = await this.getAuthHeaders();
      const params: string[] = [];
      if (filters?.jobId) params.push(`jobId=${encodeURIComponent(filters.jobId)}`);
      if (filters?.candidateId) params.push(`candidateId=${encodeURIComponent(filters.candidateId)}`);
      const query = params.length ? `?${params.join('&')}` : '';

      const response = await firstValueFrom(
        this.http.get<CompanyConversationsResponse>(`${this.apiUrl}/company/conversations${query}`, { headers })
      );
      return response.conversations ?? [];
    } catch (err: any) {
      const backendError = err instanceof HttpErrorResponse ? err.error?.error : null;
      const code = backendError?.code || (err.status ? `HTTP_${err.status}` : 'UNKNOWN_ERROR');
      const message = backendError?.message || err.message || 'Failed to fetch company conversations';
      console.warn(`[MessagesService] getCompanyConversations backend error (${code}): ${message}`);

      // Fail closed on auth / permission errors: never fall back to a direct
      // query after an explicit 401 or 403.
      if (code === 'UNAUTHORIZED' || code === 'FORBIDDEN' || err.status === 401 || err.status === 403) {
        return [];
      }

      // Offline / development fallback to the previous direct Supabase path.
      console.warn('[MessagesService] getCompanyConversations: attempting direct Supabase query fallback.');
      const profileId = this.authService.getCurrentUserId();
      if (!profileId) return [];

      const rows = await this.getConversations(profileId);
      return rows
        .map((row: any) => {
          const conversation = row.conversations;
          const match = conversation?.matches;
          return {
            id: conversation?.id ?? row.conversation_id,
            match_id: conversation?.match_id ?? '',
            created_at: conversation?.created_at ?? '',
            updated_at: conversation?.updated_at ?? '',
            company_id: match?.company_id ?? null,
            job: match?.jobs ? { id: match.job_id, title: match.jobs.title } : null,
            candidate: null,
            participant_ids: [profileId],
            last_message: null,
            last_message_at: null,
            unread_count: 0,
          } as CompanyConversation;
        })
        .filter((conversation: CompanyConversation) => conversation.id);
    }
  }

  /**
   * Retrieve a conversation with its messages.
   * Calls Express backend GET /api/company/conversations/:conversationId.
   */
  async getCompanyConversation(
    conversationId: string
  ): Promise<{ conversation: CompanyConversation; messages: CompanyMessage[] } | null> {
    try {
      const headers = await this.getAuthHeaders();
      const response = await firstValueFrom(
        this.http.get<CompanyConversationResponse>(
          `${this.apiUrl}/company/conversations/${conversationId}`,
          { headers }
        )
      );
      if (!response.conversation) return null;
      return { conversation: response.conversation, messages: response.messages ?? [] };
    } catch (err: any) {
      if (err instanceof HttpErrorResponse && err.status === 404) {
        return null;
      }
      const backendError = err instanceof HttpErrorResponse ? err.error?.error : null;
      const message = backendError?.message || err.message || 'Failed to fetch conversation';
      console.warn(`[MessagesService] getCompanyConversation error: ${message}`);
      return null;
    }
  }

  /**
   * Send a message in a company conversation.
   * Calls Express backend POST /api/company/conversations/:conversationId/messages.
   *
   * The sender is always the authenticated caller, so there is no sender
   * parameter here and no local fallback: a message is only reported as sent
   * once the database stored it.
   */
  async sendCompanyMessage(
    conversationId: string,
    message: string,
    messageType: MessageRow['message_type'] = 'text'
  ): Promise<{ data: CompanyMessage | null; error: string | null; code?: string }> {
    try {
      const headers = await this.getAuthHeaders();
      const response = await firstValueFrom(
        this.http.post<CompanyMessageResponse>(
          `${this.apiUrl}/company/conversations/${conversationId}/messages`,
          { message, message_type: messageType },
          { headers }
        )
      );
      return { data: response.message ?? null, error: null };
    } catch (err: any) {
      if (err instanceof HttpErrorResponse) {
        const backendError = err.error?.error;
        const code = backendError?.code || `HTTP_${err.status}`;
        const message = backendError?.message || err.message || 'Failed to send message';
        console.error('[MessagesService] sendCompanyMessage error:', message);
        return { data: null, error: message, code };
      }
      return { data: null, error: err?.message || 'Network error occurred', code: 'NETWORK_ERROR' };
    }
  }

  /**
   * Upload an attachment to the conversation's storage folder and create the
   * file message through the company API.
   *
   * The upload goes to Supabase Storage: the `message-attachments` bucket
   * policy scopes it to the conversation, and Express does not handle file
   * uploads. The message row itself is created by the backend, so the sender
   * is always the authenticated caller.
   */
  async sendCompanyFileMessage(
    conversationId: string,
    file: File
  ): Promise<{ data: CompanyMessage | null; error: string | null; code?: string }> {
    const filePath = `${conversationId}/${Date.now()}_${file.name}`;

    const { error: storageError } = await this.supabase.client.storage
      .from('message-attachments')
      .upload(filePath, file);

    if (storageError) {
      return { data: null, error: storageError.message };
    }

    const { data: urlData } = await this.supabase.client.storage
      .from('message-attachments')
      .getPublicUrl(filePath);

    return this.sendCompanyMessage(conversationId, urlData.publicUrl, 'file');
  }

  // ── Conversations & Messages (Direct Supabase) ────────────────────────────
  /**
   * Get all conversations for the current user.
   * RLS ensures only conversations where the user is a member are returned.
   */
  async getConversations(profileId: string): Promise<any[]> {
    const { data, error } = await this.supabase.client
      .from('conversation_members')
      .select('conversation_id, conversations(id, match_id, updated_at, matches(job_id, job_seeker_id, jobs(title), companies(name, logo_url), job_seeker_profiles(profiles(full_name, avatar_url))))')
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

    const { data: urlData } = await this.supabase.client.storage
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
   *
   * NOTE: public.messages has no UPDATE policy in the RLS migrations, so this
   * update is refused by the database. The method is kept for API compatibility
   * and the read state is tracked in the UI instead.
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
