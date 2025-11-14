import { google } from 'googleapis'

export interface SheetRow {
  [ key: string ]: string | boolean
}

// TODO: Add logging
class SheetsService {
  private sheets: any
  private auth: any

  constructor() {
    // TODO: Might want to consider authenticating using OAuth2.0
    // See https://github.com/googleapis/google-api-nodejs-client/blob/main/samples/sheets/quickstart.js
    this.auth = new google.auth.GoogleAuth( {
      keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS!,
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets.readonly'
      ]
    } )

    this.sheets = google.sheets( { version: 'v4', auth: this.auth } )
  }

  async getSheetData( spreadsheetId: string, range: string ): Promise< SheetRow[] > {
    try {
      const response = await this.sheets.spreadsheets.values.get( {
        spreadsheetId,
        range
      } )

      const rows = response.data.values || []

      if( !rows || !rows.length ) {
        console.log( `No data found for range: ${ range }` )
        return []
      }

      // Get headers so that we can use it to map the data to the correct keys
      const headers = rows[ 0 ]
      // To contain mapped data from sheets to object
      const sheetData: SheetRow[] = rows.slice( 1 ).map( ( row: string[] ) => {
        // We need to reduce each row to an object with the correct keys
        return headers.reduce( ( sheetRow: SheetRow, header: string, index: number ) => {
          // Convert TRUE/FALSE strings to booleans
          if( header == 'active' ) {
            sheetRow[ header ] = row[ index ] == 'TRUE'
          }
          sheetRow[ header ] = row[ index ]
          return sheetRow
        }, {} )
      } )

      return sheetData
    } catch (error) {
      console.error( `Error getting sheet data: ${ JSON.stringify( error ) }` )
      throw error
    }
  }

  async getTeacherSheet( spreadsheetId: string ): Promise< SheetRow[] > {
    return this.getSheetData( spreadsheetId, 'Teachers!A:E' )
  }

  async getStudentSheet( spreadsheetId: string ): Promise< SheetRow[] > {
    return this.getSheetData( spreadsheetId, 'Students!A:E' )
  }
}

export default new SheetsService()