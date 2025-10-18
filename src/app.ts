import express from 'express'
import http from 'http'	

// App config
const PORT = process.env.PORT || 5000
const app = express()

const server = http.createServer( app )

const start = async () => {
  try {
    console.log( 'Starting server...' )
    server.listen( PORT, () => {
      console.log( `Server is running on port ${PORT}` )
    } )
    
  } catch (error) {
    console.log( `Error starting server: ${error}` )
  }
}

start()