import { Request, Response } from 'express'
import dayjs from 'dayjs'
// Middleware
import asyncWrapper from '../middleware/asyncWrapper.js'
// Repositories
import conversationRepository, { ConversationType, Message } from '../repositories/conversation.repository.js'
// Services
import claudeService from '../services/claude.service.js'
import handleIntent, { updateConversationIntent } from '../services/intent.service.js'
import { sendWhatsappMessage } from '../config/twilio.js'
import { updateTokenTracking } from '../utils/costMonitoring.js'

// Helper function to extract phone number from twilio request body
const extractPhoneNumber = ( phoneNumber: string ): string => phoneNumber.replace( 'whatsapp:+', '' )

const processMessageAsync = async ( from: string, body: string, messageSid: string ): Promise< void > => {
  try {
    const phoneNumber = extractPhoneNumber( from )
    // Get or create conversation
    let conversation = await conversationRepository.findActiveByUserPhone( phoneNumber )

    if ( !conversation ) {
      console.log( `No active conversation found for phone number: ${ phoneNumber }` )

      conversation = await conversationRepository.create( {
        user_phone: phoneNumber,
        conversation_type: ConversationType.GENERAL,
        context: {
          current_intent: 'greeting',
        },
        message_history: [],
        status: 'active'
      } )

      console.log( `Created new conversation for phone number: ${ phoneNumber }` )
    }

    // Check for duplicates
    if( conversation.message_history.some( ( message: Message ) => message.message_sid == messageSid ) ) {
      console.log( `Duplicate message detected for SID: ${ messageSid }` )
      return
    }

    // Append message to conversation history
    await conversationRepository.appendMessage( conversation.id!, {
      role: 'user',
      content: body,
      timestamp: dayjs().toISOString(),
      message_sid: messageSid
    } )

    // Process message with Claude
    const claudeResponse = await claudeService.processMessage(
      phoneNumber,
      body, 
      conversation.message_history, 
      conversation.context 
    )
    
    if( conversation.conversation_type == ConversationType.GENERAL && claudeResponse.intent != 'general' ) {
      conversation = await updateConversationIntent( conversation, claudeResponse.intent )
    }
    
    // Update convestion context with intent
    await handleIntent( conversation, claudeResponse )

    await sendWhatsappMessage( from, claudeResponse.conversationalReply )
    
    // Store assistant reply in conversation
    await conversationRepository.appendMessage( conversation.id!, {
      role: 'assistant',
      content: claudeResponse.conversationalReply,
      timestamp: dayjs().toISOString(),
      message_sid: messageSid,
      claude_usage: claudeResponse.usage
    } )

    await updateTokenTracking( conversation.id!, claudeResponse.usage )

  } catch (error) {
    console.error(`Error processing message from ${from}: ${JSON.stringify(error)}`)

    try {
      await sendWhatsappMessage( from, 'An error occurred while processing your message. Please try again later.' )
    } catch (error) {
      console.error(`Error sending error message to ${from}: ${error}`)
    }

    throw error
  }
}

const handleIncomingMessage = asyncWrapper( async ( request: Request, response: Response ): Promise< void > => {

  const { From, Body, MessageSid } = request.body

  response.status( 200 ).send()

  await processMessageAsync( From, Body, MessageSid )

  console.log( 'Message processed successfully' )
} )

export {
  handleIncomingMessage,
}