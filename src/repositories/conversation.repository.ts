import dayjs from 'dayjs'
import supabase from '../config/database.js'
import BaseRepository from './base.repository.js'

export type Role = 'user' | 'assistant' | 'system'

export type ConversationStatus = 'active' | 'completed' | 'abandoned'

export interface ConversationContext {
  current_intent?: string
  partial_booking?: {
    scheduled_time: string
    teacher_id: string
  }
  negotiation_turn?: number
  lesson_id?: string
  conflicts?: any[]
  suggested_alternatives?: any[]
  [key: string]: any
}

export interface Message {
  role: Role
  content: string
  timestamp: string
  message_sid?: string
  claude_usage?: {
    input_tokens: number
    output_tokens: number
  }
}

export enum ConversationType {
  BOOKING = 'booking',
  CANCELLATION = 'cancellation',
  REMINDER = 'reminder',
  GENERAL = 'general'
}

export interface Conversation {
  id?: string
  user_phone: string
  conversation_type: ConversationType
  message_history: Message[]
  context: ConversationContext
  lesson_id?: string
  status: ConversationStatus
  created_at?: string
  updated_at?: string
}

// TODO: Add logging
class ConversationRepository extends BaseRepository< Conversation > {
  constructor() {
    super( 'conversations' )
  }

  async findActiveByUserPhone( userPhone: string ): Promise< Conversation | null > {

    const { data, error } = await supabase
      .from( this.tableName )
      .select( '*' )
      .eq( 'user_phone', userPhone )
      .eq( 'status', 'active' )
      .maybeSingle()

    if ( error ) throw error

    return data as Conversation | null
  }

  async createConversation( conversation: Conversation ): Promise< Conversation > {
    return this.create( conversation )
  }

  async appendMessage( conversationId: string, message: Message ): Promise< Conversation > {

    const conversation = await this.findById( conversationId )
    if ( !conversation ) throw new Error( 'Conversation not found' )

    const updatedConversation = {
      ...conversation,
      message_history: [ ...conversation.message_history, message ]
    }

    return this.update( conversationId, updatedConversation )
  }

  async updateContext( conversationId: string, context: ConversationContext ): Promise< Conversation > {

    const conversation = await this.findById( conversationId )
    if ( !conversation ) throw new Error( 'Conversation not found' )

    const updatedConversation = {
      ...conversation,
      context: { ...conversation.context, ...context }
    }

    return this.update( conversationId, updatedConversation )
  }

  async markAsCompleted( conversationId: string ): Promise< Conversation > {
    return this.update( conversationId, { status: 'completed' } as Conversation )
  }

  async markAsAbandoned( conversationId: string ): Promise< Conversation > {
    return this.update( conversationId, { status: 'abandoned' } as Conversation )
  }

  async linkToLesson( conversationId: string, lessonId: string ): Promise< Conversation > {
    return this.update( conversationId, { lesson_id: lessonId } as Conversation )
  }

  async findByLessonId( lessonId: string ): Promise< Conversation | null > {
   
    const { data, error } = await supabase
      .from( this.tableName )
      .select( '*' )
      .eq( 'lesson_id', lessonId )
      .maybeSingle()

    if ( error ) throw error

    return data as Conversation | null
  }

  async findStaleConversations( hoursInActive: number = 24 ): Promise< Conversation[] > {

    const cutoffTime = dayjs().subtract( hoursInActive, 'hours' ).toISOString()

    const { data, error } = await supabase
      .from( this.tableName )
      .select( '*' )
      .eq( 'status', 'active' )
      .lt( 'updated_at', cutoffTime )

    if ( error ) throw error

    return data as Conversation[]
  }
}

export default new ConversationRepository()