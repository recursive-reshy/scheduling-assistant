import dayjs from 'dayjs'
// Claude
import { callClaude, ClaudeResponse } from '../config/claude.js'
// Types
import { ConversationContext, Message } from '../repositories/conversation.repository.js'
import { MessageParam } from '@anthropic-ai/sdk/resources'

export interface BookingIntent {
  hasBookingIntent: boolean
  scheduledTime?: string
  calendarId?: string
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

  async processMessage(
    userPhone: string,
    userMessage: string,
    conversationHistory: Message[],
    context: ConversationContext
  ): Promise< ClaudeResponse > {
    try {
      
      const systemPrompt = this.buildSystemPrompt( userPhone, context )

      // Format message to be parsed as context for Claude
      const messages = this.formatMessagesForClaude( conversationHistory, userMessage )

      // Process user message and get response from Claude
      const response = await callClaude( messages, systemPrompt )

      return response

    } catch (error) {
      console.error(`Error processing message: ${ error }`)
      throw error
    }
  }

  detectBookingIntent( 
    context: ConversationContext,
    response: ClaudeResponse
  ): BookingIntent {

    const partialBooking = context.partial_booking

    if( !partialBooking?.scheduled_time ) {
      return { hasBookingIntent: false }
    }

    const checkAvailability = response.toolUses.find( ( { name } ) => name == 'checkAvailability' )

    if( !checkAvailability ) {
      return { hasBookingIntent: false }
    }

    const toolResult = response.toolResults.find( ( { toolUseId } ) => toolUseId == checkAvailability.id )

    if( !toolResult || toolResult.isError ) {
      return { hasBookingIntent: false }
    }

    const isAvailable = !toolResult.content.some( ( { type, text } ) => type == 'text' && text.toLowerCase().includes( 'conflict' ) )

    return {
      hasBookingIntent: isAvailable,
      scheduledTime: partialBooking.scheduled_time,
      calendarId: partialBooking.teacher_id
    }
  }
}

export default new ClaudeService()