import { Request, Response, NextFunction } from 'express'

const asyncWrapper = ( callback: Function ) => {
  return async ( request: Request, response: Response, next: NextFunction ) => {
    try {
      await callback( request, response, next )
    } catch ( error ) {
      console.error( `Error in ${ callback.name }: ${ error }` )
      next( error )
    }
  }
}

export default asyncWrapper