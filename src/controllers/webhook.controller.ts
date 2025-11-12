import { Request, Response } from 'express'
import dayjs from 'dayjs'
// Middleware
import asyncWrapper from '../middleware/asyncWrapper.js'
// Repositories
import conversationRepository, { ConversationType, Message } from '../repositories/conversation.repository.js'
// Services
import { sendWhatsappMessage } from '../config/twilio.js'

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

    // Send echo reply (for now - Claude integration in Week 2)
    await sendWhatsappMessage( from, `Echo: ${ body }` )
    
    // Store assistant reply in conversation
    await conversationRepository.appendMessage( conversation.id!, {
      role: 'assistant',
      content: `Echo: ${ body }`,
      timestamp: dayjs().toISOString(),
      message_sid: messageSid
    } )

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