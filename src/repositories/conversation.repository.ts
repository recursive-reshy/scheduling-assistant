import dayjs from 'dayjs'
import supabase from '../config/database.js'
import BaseRepository from './base.repository.js'

type Role = 'user' | 'assistant' | 'system'

type ConversationStatus = 'active' | 'completed' | 'abandoned'

interface Message {
  role: Role
  content: string
  timestamp: string
  message_sid?: string
  claude_usage?: {
    inputTokens: number
    outputTokens: number
  }
}

interface ConversationContext {
  currentIntent: string
  partialBooking: {
    scheduledTime: string
    teacherId: string
  }
  negotiationTurn?: number
  lessonId?: string
  conflicts?: any[]
  suggestedAlternatives?: any[]
  [key: string]: any
}

export enum ConversationType {
  BOOKING = 'booking',
  CANCELLATION = 'cancellation',
  REMINDER = 'reminder',
  GENERAL = 'general'
}

export interface Conversation {
  id: string
  userPhone: string
  conversationType: ConversationType
  messageHistory: Message[]
  context: ConversationContext
  lessonId?: string
  status: ConversationStatus
  createdAt: string
  updatedAt: string
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
      messageHistory: [ ...conversation.messageHistory, message ]
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
    return this.update( conversationId, { lessonId } as Conversation )
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

export default ConversationRepository