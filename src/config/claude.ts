import Anthropic from '@anthropic-ai/sdk'
// Types
import { MessageCreateParamsNonStreaming, MessageParam } from '@anthropic-ai/sdk/resources.js'
import { BetaTextBlock } from '@anthropic-ai/sdk/resources/beta.mjs'

export interface ClaudeResponse {
  reply: string
  toolUses: ToolUse[]
  toolResults: ToolResult[]
  usage: {
    input_tokens: number
    output_tokens: number
  }
}

export interface ToolUse {
  id: string
  name: string // TODO: Add enum for tool names
  input: Record< string, any >
  serverName: string
}

export interface ToolResult {
  toolUseId: string
  content: BetaTextBlock[]
  isError: boolean
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
    while( response.stop_reason == 'tool_use' ) {

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
    const toolResults = response.content
      .map( ( tool ) => {
        if( tool.type != 'mcp_tool_result' ) return null

        const { tool_use_id, is_error, content } = tool

        return { 
          toolUseId: tool_use_id,
          isError: is_error,
          content
        }
      } )
      .filter(Boolean) as ToolResult[]

    const toolUses = response.content
      .map( ( tool ) => { 
        if( tool.type != 'mcp_tool_use' ) return null

        const { id, name, input, server_name } = tool

        return {
          id,
          name,
          input,
          serverName: server_name
        }
      } )
      .filter(Boolean) as ToolUse[]

    // TODO: Remove this after testing
    console.log( { toolUses, toolResults } )

    return { 
      reply: content.text, 
      toolUses: toolUses || [],
      toolResults: toolResults || [], 
      usage: response.usage 
    }
    
  } catch ( error ) {
    console.error(`Error calling Claude: ${ error }`)
    throw error
  }
}

export default anthropic

export { callClaude }