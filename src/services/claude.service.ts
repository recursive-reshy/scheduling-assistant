import dayjs from 'dayjs'
// Claude
import { callClaude } from '../config/claude.js'
// Types
import { ConversationContext, Message } from '../repositories/conversation.repository.js'
import { MessageParam } from '@anthropic-ai/sdk/resources'

type Intent = 'booking' | 'cancellation' | 'query' | 'general'

type Confidence = 'high' | 'medium' | 'low'

interface ParsedIntent {
  intent: Intent
  entities: {
    teacher_id?: string
    scheduled_time?: string
    duration?: number
  }
  conversationalReply: string
  confidence: Confidence
}

class ClaudeService {

  // Build the system prompt where it sets the context for the assistant
  // Prompt sets intent, confidence, teacher_id, datetime, duration
  // Also includes examples of how to respond to the user's message
  // If there is a booking conflict, it includes the suggested alternatives
  private buildSystemPrompt( context: ConversationContext ): string {

    const { current_intent, suggested_alternatives } = context
    
    // TODO: Maybe find a way to store prompts in a file and load them dynamically
    let prompt = `
      You are a helpful guitar lesson scheduling assistant for WhatsApp.
      
      **Your Role:**
      - Help students book, reschedule, or cancel guitar lessons
      - Understand their scheduling preferences naturally
      - Be conversational and friendly
      - Keep responses SHORT (1-3 sentences max - this is WhatsApp!)

      **Current Conversation Context:**
      ${JSON.stringify(context, null, 2)}

      **Intent Detection Instructions:**
      After your conversational response, you MUST include a structured data block in this EXACT format:

      ---INTENT---
      INTENT: [booking|cancellation|query|general]
      CONFIDENCE: [high|medium|low]
      TEACHER: [teacher_id if mentioned, otherwise NONE]
      DATETIME: [ISO 8601 format if specified, otherwise NONE]
      DURATION: [minutes if specified, otherwise NONE]
      ---END---

      **Examples:**

      User: "I want to book a lesson"
      Response: "Great! I'd love to help you book a lesson. When would you like to schedule it?"
      ---INTENT---
      INTENT: booking
      CONFIDENCE: high
      TEACHER: NONE
      DATETIME: NONE
      DURATION: NONE
      ---END---

      User: "Can I book for Monday at 6pm?"
      Response: "Monday at 6pm works! Let me check availability with your teacher."
      ---INTENT---
      INTENT: booking
      CONFIDENCE: high
      TEACHER: NONE
      DATETIME: 2025-11-17T18:00:00+08:00
      DURATION: NONE
      ---END---

      User: "When is my next lesson?"
      Response: "Let me check your upcoming lessons for you."
      ---INTENT---
      INTENT: query
      CONFIDENCE: high
      TEACHER: NONE
      DATETIME: NONE
      DURATION: NONE
      ---END---

      User: "I need to cancel"
      Response: "I understand you need to cancel a lesson. Which lesson would you like to cancel?"
      ---INTENT---
      INTENT: cancellation
      CONFIDENCE: high
      TEACHER: NONE
      DATETIME: NONE
      DURATION: NONE
      ---END---

      User: "Hey how are you?"
      Response: "I'm doing great, thanks for asking! How can I help you today?"
      ---INTENT---
      INTENT: general
      CONFIDENCE: high
      TEACHER: NONE
      DATETIME: NONE
      DURATION: NONE
      ---END---

      **CRITICAL:**
      - ALWAYS include the intent block after your response
      - Keep conversational response SHORT (WhatsApp messages should be brief)
      - Be natural and friendly
      - Use Singapore timezone (UTC+8) for datetime conversions
    `

    if( current_intent == 'booking' && suggested_alternatives ) {
      prompt += ` 
        \n\n**IMPORTANT - BOOKING CONFLICT:**
        The user's requested time is NOT available. Here are alternative times:
        ${suggested_alternatives.map( ( { start }, index ) => 
          `${ index + 1 }. ${ dayjs( start ).format( 'DD-MM-YYYY HH:mm' ) }`
        ).join( '\n' ) }
        Suggest these alternatives naturally in your response.
      `
    }
    
    return prompt
  }

  // Takes conversation history and new message, format it to what Claude expects
  private formatMessagesForClaude(
    history: Message[],
    newMessage: string
  ): MessageParam[] {

    const messages = history
      .filter( ( { role } ) => role != 'system' )
      .map( ( { role, content } ): MessageParam => ( { 
        role: ( role == 'user' ? 'user' : 'assistant' ) as 'user' | 'assistant', 
        content 
      } ) )
      
    messages.push( { role: 'user', content: newMessage } )

    return messages
  }

  private parseClaudeResponse( response: string ): ParsedIntent {

    // Split response into conversational part and intent block
    const parts = response.split( '---INTENT---' )

    if( parts.length < 2 ) {
      return {
        intent: 'general',
        entities: {},
        conversationalReply: response,
        confidence: 'low'
      }
    }

    const conversationalReply = parts[ 0 ].trim()
    const intentBlock = parts[1].split( '---END---' )[ 0 ].trim()

    // Parse intent block
    // TODO: Check this throughly. Need to think a bit more on the flow here
    const intentMatch = intentBlock.match( /INTENT:\s*(\w+)/ )
    const confidenceMatch = intentBlock.match( /CONFIDENCE:\s*(\w+)/ )
    const teacherMatch = intentBlock.match( /TEACHER:\s*(.+)/ )
    const datetimeMatch = intentBlock.match( /DATETIME:\s*(.+)/ )
    const durationMatch = intentBlock.match( /DURATION:\s*(\d+)/ )

    const intent = ( intentMatch?.[ 1 ] || 'general' ) as ParsedIntent[ 'intent' ]
    const confidence = ( confidenceMatch?.[ 1 ] || 'medium' ) as ParsedIntent[ 'confidence' ]

    const entities: ParsedIntent[ 'entities' ] = {}

    if ( teacherMatch && teacherMatch[ 1 ] != 'NONE' ) {
      entities.teacher_id = teacherMatch[ 1 ].trim()
    }

    if ( datetimeMatch && datetimeMatch[ 1 ] != 'NONE' ) {
      try {
        // Validate and normalize datetime
        const datetime = new Date( datetimeMatch[ 1 ].trim() )

        if ( !isNaN( datetime.getTime() ) ) {
          entities.scheduled_time = datetime.toISOString()
        }
      } catch ( error ) {
        console.error( `Failed to parse datetime: ${ error }` )
      }
    }

    if ( durationMatch ) {
      entities.duration = parseInt( durationMatch[ 1 ] )
    }

    return {
      intent,
      entities,
      conversationalReply,
      confidence
    }
  }

  async processMessage(
    userMessage: string,
    conversationHistory: Message[],
    context: ConversationContext
  ): Promise< ParsedIntent > {
    try {
      
      const systemPrompt = this.buildSystemPrompt( context )

      const messages = this.formatMessagesForClaude( conversationHistory, userMessage )

      const response = await callClaude( messages, systemPrompt )

      const parsedIntent = this.parseClaudeResponse( response.content )

      return parsedIntent

    } catch (error) {
      console.error(`Error processing message: ${ error }`)
      throw error
    }
  }
}

export default new ClaudeService()