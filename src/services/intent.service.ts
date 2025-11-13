// Repositories
import conversationRepository, { Conversation, ConversationType } from '../repositories/conversation.repository.js'
// Types
import { Intent, ParsedIntent } from './claude.service.js'

const handleBookingIntent = async (
  conversation: any,
  entities: any
): Promise< void > => {
  console.log( 'Booking intent detected' )

  // TODO: Week 3 - Check availability, create lesson, etc.
  await conversationRepository.updateContext( conversation.id, {
    current_intent: 'booking',
    partial_booking: {
      scheduled_time: entities.scheduled_time,
      teacher_id: entities.teacher_id
    },
    negotiation_turn: ( conversation.context.negotiation_turn || 0 ) + 1
  } )
}

const handleCancellationIntent = async (
  conversation: any
): Promise< void > => {
  console.log( 'Cancellation intent detected' )

  // TODO: Week 3 - Find lessons to cancel
  await conversationRepository.updateContext( conversation.id, {
    current_intent: 'cancellation'
  } )
}

const handleQueryIntent = async (
  conversation: any
): Promise< void > => {
  console.log( 'Query intent detected' )

  // TODO: Week 3 - Look up lesson information
  await conversationRepository.updateContext( conversation.id, {
    current_intent: 'query'
  } )
}

const handleIntent = async (
  conversation: any, // TODO: update type
  claudeResponse: ParsedIntent
): Promise< void > => {

  const { intent, entities } = claudeResponse

  switch( intent ) {
    case 'booking':
      await handleBookingIntent( conversation, entities )
      break

    case 'cancellation':
      await handleCancellationIntent( conversation )
      break

    case 'query':
      await handleQueryIntent( conversation )
      break
    
    case 'general':
      console.log( 'General intent detected', { conversation, claudeResponse } )
      break

    default:
      console.log( 'Unknown intent detected', { conversation, claudeResponse } )
      break
  }
}

const updateConversationIntent = async ( conversation: any, intent: Intent ): Promise < Conversation > => {
  
  let updatedType: ConversationType

  switch( intent ) {
    case 'booking':
      updatedType = ConversationType.BOOKING
      break
    case 'cancellation':
      updatedType = ConversationType.CANCELLATION
      break
    case 'query':
      updatedType = ConversationType.QUERY
      break
    default:
      updatedType = ConversationType.GENERAL
      break
  }

  return await conversationRepository.update( 
    conversation.id, 
    { conversation_type: updatedType } as Conversation 
  )
}

export default handleIntent

export { updateConversationIntent }