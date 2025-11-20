import dayjs from 'dayjs'
// Claude
import { callClaude } from '../config/claude.js'
// Types
import { ConversationContext, Message } from '../repositories/conversation.repository.js'
import { MessageParam } from '@anthropic-ai/sdk/resources'

type Confidence = 'high' | 'medium' | 'low'

export type Intent = 'booking' | 'cancellation' | 'query' | 'general'

export interface ParsedIntent {
  intent: Intent
  entities: {
    teacher_id?: string
    scheduled_time?: string
    duration?: number
  }
  conversationalReply: string
  confidence: Confidence
  usage: {
    input_tokens: number
    output_tokens: number
  }
}

class ClaudeService {

  // Build the system prompt where it sets the context for the assistant
  // Prompt sets intent, confidence, teacher_id, datetime, duration
  // Also includes examples of how to respond to the user's message
  // If there is a booking conflict, it includes the suggested alternatives
  private buildSystemPrompt( userPhone: string, context: ConversationContext ): string {

    const { current_intent, suggested_alternatives } = context
    
    // TODO: Maybe find a way to store prompts in a file and load them dynamically
    let prompt = `
      You are a helpful guitar lesson scheduling assistant for WhatsApp.

      **Student Info:**
      - Phone: ${ userPhone }
      - Current Intent: ${ current_intent || 'none' }

      **Your Job:**
      - Have natural conversations about scheduling
      - Use MCP calendar tools to check availability
      - When student confirms a time, note it but DON'T create the event yet
      - Tell student "I'll confirm with your teacher and get back to you"

      **Available MCP Tools:**
      - checkAvailability: Check if specific time is free
      - findAvailableSlots: Find all free slots on a specific date / time range
      - createEvent: DO NOT USE - backend handles after teacher approval
      - updateEvent: DO NOT USE - backend handles after teacher approval
      - deleteEvent: DO NOT USE - backend handles after teacher approval

      **Important:**
      - Always check availability before proposing times
      - Keep responses SHORT (1-2 sentences, this is WhatsApp)
      - Be conversational and friendly
      - Singapore timezone (UTC+8)

      ${ 
          suggested_alternatives ?
            `**Alternative times available:**\n
              ${ suggested_alternatives
                  .map( ( { start }, index ) => `${ index + 1 }. ${ dayjs( start ).format( 'DD-MM-YYYY HH:mm' ) }` )
                  .join( '\n' ) 
              } 
            ` 
          :
            '' 
        }

      Current conversation: ${ JSON.stringify( context, null, 2 ) }
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
      .filter( ( { role } ) => role != 'system' ) // We don't need to include system messages
      .map( ( { role, content } ): MessageParam => ( { 
        role: ( role == 'user' ? 'user' : 'assistant' ) as 'user' | 'assistant', 
        content 
      } ) )
      
    messages.push( { role: 'user', content: newMessage } )

    return messages
  }

  private parseClaudeResponse( response: string, usage: { input_tokens: number, output_tokens: number } ): ParsedIntent {

    console.log( { response } )
    
    // Split response into conversational part and intent block
    const parts = response.split( '---INTENT---' )

    if( parts.length < 2 ) {
      return {
        intent: 'general',
        entities: {},
        conversationalReply: response,
        confidence: 'low',
        usage: {
          input_tokens: 0,
          output_tokens: 0
        }
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
      confidence,
      usage
    }
  }

  async processMessage(
    userPhone: string,
    userMessage: string,
    conversationHistory: Message[],
    context: ConversationContext
  ): Promise< ParsedIntent > {
    try {
      
      const systemPrompt = this.buildSystemPrompt( userPhone, context )

      const messages = this.formatMessagesForClaude( conversationHistory, userMessage )

      const response = await callClaude( messages, systemPrompt )

      const parsedIntent = this.parseClaudeResponse( response.content, response.usage )

      return parsedIntent

    } catch (error) {
      console.error(`Error processing message: ${ error }`)
      throw error
    }
  }
}

export default new ClaudeService()