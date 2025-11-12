import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL!
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!

// TODO: Add database type
const supabase = createClient( supabaseUrl, supabaseAnonKey )

export default supabase

// TODO: Find a better way to test database connection
export const testDatabaseConnection = async () => {
  try {
    const { data, error } = await supabase.from( 'test' ).select( '*' )

    if ( error ) throw error
    
    return data
  } catch ( error ) {
    console.error( `Error testing database connection: ${JSON.stringify( error )}` )
    throw error
  }
}