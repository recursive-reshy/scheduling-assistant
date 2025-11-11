import { Request, Response } from 'express'
import dayjs from 'dayjs'
// Middleware
import asyncWrapper from '../middleware/asyncWrapper.js'
// Repositories
import conversationRepository, { ConversationType } from '../repositories/conversation.repository.js'
// Services
import { sendWhatsappMessage } from '../config/twilio.js'

const processMessageAsync = async ( from: string, body: string, messageSid: string ): Promise< void > => {
  try {

    // Get or create conversation
    let conversation = await conversationRepository.findActiveByUserPhone( from )

    if ( !conversation ) {
      conversation = await conversationRepository.create({
        userPhone: from,
        conversationType: ConversationType.GENERAL,
        context: {
          currentIntent: 'greeting',
        },
        messageHistory: [],
        status: 'active'
      })
    }

    // Check for duplicates
    if( conversation.messageHistory.some( message => message.message_sid == messageSid ) ) {
      console.log( `Duplicate message detected for SID: ${messageSid}` )
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
    await sendWhatsappMessage( from, `Echo: ${body}` )
    
    // Store assistant reply in conversation
    await conversationRepository.appendMessage( conversation.id!, {
      role: 'assistant',
      content: `Echo: ${body}`,
      timestamp: dayjs().toISOString(),
      message_sid: messageSid
    } )

  } catch (error) {
    console.error(`Error processing message from ${from}: ${error}`)

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
} )

export {
  handleIncomingMessage,
}