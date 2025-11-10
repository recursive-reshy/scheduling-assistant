import express from 'express'

const app = express()

// Middleware
app.use( express.json() )
app.use( express.urlencoded( { extended: true } ) )

// Routes
app.get( '/health', ( req, res ) => {
  res.status( 200 ).json( { 
    status: 'healthy',
    timestamp: new Date().toISOString()
  } )
} )

export default app