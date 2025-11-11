import express from 'express'
import { testDatabaseConnection } from './config/database.js'
// Routes
import routes from './routes/index.js'

const app = express()

// Middleware
app.use( express.json() )
app.use( express.urlencoded( { extended: true } ) )

app.use( '/api', routes )

// Routes
app.get( '/health', async ( _, res ) => {
  try {
    await testDatabaseConnection()
  } catch ( error ) {
    console.error( `Error testing database connection: ${error}` )
    return res.status( 500 ).json( { error: 'Database connection failed' } )
  }
  
  console.log( 'Database connection successful' )

  res.status( 200 ).json( { 
    status: 'healthy',
    timestamp: new Date().toISOString()
  } )
} )

export default app