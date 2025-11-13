// Repositories
import conversationRepository from '../repositories/conversation.repository.js'

// TODO: Add logging
const updateTokenTracking = async (
  conversationId: string,
  usage: { input_tokens: number, output_tokens: number }
): Promise< void > => {
  const conversation = await conversationRepository.findById( conversationId )
  
  if ( !conversation ) return

  const currentTokens = conversation.context.token_tracking || {
    total_input_tokens: 0,
    total_output_tokens: 0,
    total_cost_sgd: 0,
    message_count: 0
  }

  // Claude Sonnet 4 pricing (as of now)
  // Input: $3 per million tokens
  // Output: $15 per million tokens
  const inputCost = ( usage.input_tokens / 1_000_000 ) * 3
  const outputCost = ( usage.output_tokens / 1_000_000 ) * 15

  await conversationRepository.updateContext( conversationId, {
    token_tracking: {
      total_input_tokens: currentTokens.total_input_tokens + usage.input_tokens,
      total_output_tokens: currentTokens.total_output_tokens + usage.output_tokens,
      total_cost_sgd: currentTokens.total_cost_sgd + inputCost + outputCost,
      message_count: currentTokens.message_count + 1
    }
  })
}

// TODO: Add logging, to be used in a cron job
const logTotalCosts = async (): Promise<void> => {
  const allConversations = await conversationRepository.findAll( 1000 )

  const totals = allConversations.reduce( ( metrics, { context } ) => {
    const tracking = context?.token_tracking

    if ( tracking ) {
      metrics.totalCost += tracking.total_cost_sgd || 0
      metrics.totalMessages += tracking.message_count || 0
    }
    return metrics
  }, { totalCost: 0, totalMessages: 0 } )

  console.log( `Total cost: $${ totals.totalCost.toFixed( 2 ) }` )
  console.log( `Total messages: ${ totals.totalMessages }` )
}

export {
  logTotalCosts,
  updateTokenTracking
}