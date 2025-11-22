import Anthropic from '@anthropic-ai/sdk'
// Types
import { MessageCreateParamsNonStreaming, MessageParam } from '@anthropic-ai/sdk/resources.js'
import { BetaTextBlock } from '@anthropic-ai/sdk/resources/beta.mjs'

export interface ClaudeResponse {
  reply: string
  toolCalls: ToolCall[]
  usage: {
    input_tokens: number
    output_tokens: number
  }
}

export interface ToolCall {
  content: BetaTextBlock[]
}

const anthropic = new Anthropic( { apiKey: process.env.ANTHROPIC_API_KEY! } )

// TODO: Add logging
const callClaude = async ( 
  messages: MessageParam[],
  system: string, 
  options?: {
    max_tokens?: number
    temperature?: number
  }
): Promise< ClaudeResponse > => {
  try {
    const { max_tokens = 1024, temperature = 0.7 } = options || {}

    const CREATE_MESSAGE_OPTIONS = {
      model: 'claude-3-5-haiku-latest',
      messages,
      system,
      max_tokens,
      temperature,
      betas: [ 'mcp-client-2025-04-04' ],
      mcp_servers: [
        { name: 'mcp-gcal-server',
          type: 'url',
          url: process.env.MCP_CALENDAR_URL!
        }
      ]
    } as MessageCreateParamsNonStreaming

    let response = await anthropic.beta.messages.create( CREATE_MESSAGE_OPTIONS )

    // Handle MCP tool execution loop
    while( response.stop_reason = 'tool_use' ) {

      const toolResults = response.content
        .map( tool => {
          if( tool.type != 'mcp_tool_result' ) return null

          const { content } = tool

          if( !Array.isArray( content ) ) return { role: 'assistant', content }

          const textBlocks = content
            .filter( ( block ) => block.type == 'text' )
            .map( ( block ) => block.text )

          return { role: 'assistant', content: textBlocks.join( '\n' ) }
        } )
        .filter(Boolean) as MessageParam[]

      messages.push( ...toolResults )

      response = await anthropic.beta.messages.create( { ...CREATE_MESSAGE_OPTIONS, messages } )
    }

    // Extract claude response
    const content = response.content.find( ( { type } ) => type == 'text' )

    if( !content || content.type != 'text' ) {
      throw new Error( 'No text content in Claude response' )
    }

    // Extract tool calls if any
    const toolCalls = response.content
      .map( ( tool ) => {
        if( tool.type != 'mcp_tool_result' ) return null

        const { content } = tool

        return { content }
      } )
      .filter(Boolean) as ToolCall[]

    return { 
      reply: content.text, 
      toolCalls: toolCalls || [], 
      usage: response.usage 
    }
    
  } catch ( error ) {
    console.error(`Error calling Claude: ${ error }`)
    throw error
  }
}

export default anthropic

export { callClaude }