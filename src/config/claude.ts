import Anthropic from '@anthropic-ai/sdk'
// Types
import { MessageParam } from '@anthropic-ai/sdk/resources.js'

export interface ClaudeResponse {
  reply: string
  toolCalls: ToolCall[]
  usage: {
    input_tokens: number
    output_tokens: number
  }
}

export interface ToolCall {
  name: string
  input: Record< string, string >
  serverName: string
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

    const response = await anthropic.beta.messages.create( {
      model: 'claude-3-5-haiku-latest',
      messages,
      system,
      max_tokens,
      temperature,
      betas: ["mcp-client-2025-04-04"],
      mcp_servers: [
        { name: 'mcp-gcal-server',
          type: 'url',
          url: process.env.MCP_CALENDAR_URL!
        }
      ]
    } )

    // Extract claude response
    const content = response.content.find( ( { type } ) => type == 'text' )

    if( !content || content.type != 'text' ) {
      throw new Error( 'No text content in Claude response' )
    }

    // Extract tool calls if any
    const toolCalls = response.content
      .map( ( tool ) => {
        if( tool.type != 'mcp_tool_use' ) return null

        const { name, input, server_name } = tool

        return { 
          name, 
          input,
          serverName: server_name // To track tool calls from specific servers
        }
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