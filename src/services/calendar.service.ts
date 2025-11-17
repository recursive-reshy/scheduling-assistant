import dayjs from 'dayjs'
import { google, calendar_v3 } from 'googleapis'

interface TimePeriod {
  start: string
  end: string
}

interface CalendarEvent {
  id: string
  summary: string
  start: string
  end: string
  description?: string
}

interface AvailabilityCheck {
  available: boolean
  conflicts?: TimePeriod[]
}

// TODO: Add logging
class CalendarService { 
  private calendar: calendar_v3.Calendar
  private auth: any

  constructor() {
    this.auth = new google.auth.GoogleAuth( {
      keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS!,
      scopes: [
        'https://www.googleapis.com/auth/calendar'
      ]
    } )

    this.calendar = google.calendar( { version: 'v3', auth: this.auth } )
  }

  async createEvent(
    calendarId: string,
    eventDetails: {
      summary: string
      start: string
      description?: string
      attendees?: string[]
    }
  ): Promise< CalendarEvent > {
    try {
      const { summary, start, description, attendees = [] } = eventDetails

      console.log( `Creating event: ${ JSON.stringify( { calendarId, eventDetails } ) }` )
      
      const response = await this.calendar.events.insert( { 
        calendarId,
        requestBody: {
          summary,
          start: {
            dateTime: dayjs( start ).toISOString(),
            timeZone: 'Asia/Singapore'
          },
          end: {
            dateTime: dayjs( start ).add( 45, 'minute' ).toISOString(),
            timeZone: 'Asia/Singapore'
          },
          description,
          attendees: attendees.map( attendee => ( { email: attendee } ) ),
          reminders: {
            useDefault: false,
            overrides: [
              { method: 'popup', minutes: 24 * 60 }, // 24 hours before event
              { method: 'popup', minutes: 60 }, // 1 hour before event
            ]
          }
        }
      } )

      const createdEvent = response.data

      console.log( `Event created: ${ JSON.stringify( createdEvent ) }` )

      return {
        id: createdEvent.id!,
        summary: createdEvent.summary!,
        start: createdEvent.start?.dateTime!,
        end: createdEvent.end?.dateTime!,
        description: createdEvent.description || undefined
      }
    } catch (error) {
      console.error( `Error creating event: ${ JSON.stringify( error ) }` )
      throw error
    }
  }

  async updateEvent(
    calendarId: string,
    eventId: string,
    eventDetails: {
      summary?: string
      start?: string
      description?: string
      attendees?: string[]
    }
  ): Promise< CalendarEvent > {
    try {

      const existingEvent = await this.calendar.events.get( {
        calendarId,
        eventId
      } )

      console.log( `Updating event: ${ JSON.stringify( existingEvent ) }` )
      

      const { data: { summary, start, description, attendees = [] } } = existingEvent

      const response = await this.calendar.events.update( { 
        calendarId,
        eventId,
        requestBody: {
          summary,
          start,
          description,
          attendees,
          ...( eventDetails.summary && { summary: eventDetails.summary } ),
          ...( eventDetails.start && { start: { dateTime: dayjs( eventDetails.start ).toISOString(), timeZone: 'Asia/Singapore' } } ),
          ...( eventDetails.description && { description: eventDetails.description } ),
          ...( eventDetails.attendees && { attendees: eventDetails.attendees.map( attendee => ( { email: attendee } ) ) } ),
        }
      } )

      const updatedEvent = response.data

      console.log( `Event updated: ${ JSON.stringify( updatedEvent ) }` )

      return {
        id: updatedEvent.id!,
        summary: updatedEvent.summary!,
        start: updatedEvent.start?.dateTime!,
        end: updatedEvent.end?.dateTime!,
        description: updatedEvent.description || undefined
      }

    } catch (error) {
      console.error(`Error updating event: ${ JSON.stringify( error ) }`);
      throw error
    }
  }

  async deleteEvent(
    calendarId: string,
    eventId: string
  ): Promise< void > {
    try {
      console.log( `Deleting event: ${ eventId }` )

      await this.calendar.events.delete( {
        calendarId,
        eventId
      } )

      console.log( `Event deleted: ${ eventId }` )
    }
    catch (error) {
      console.error(`Error deleting event: ${ JSON.stringify( error ) }`);
      throw error
    }
  }

  async checkAvailability(
    calendarId: string,
    scheduledTime: string | Date
  ): Promise< AvailabilityCheck > {
    try {

      const response = await this.calendar.freebusy.query( {
        requestBody: {
          timeMin: typeof scheduledTime == 'string' ? dayjs( scheduledTime ).toISOString() : scheduledTime.toISOString(),
          timeMax: dayjs( scheduledTime ).add( 1, 'hour' ).toISOString(),
          timeZone: 'Asia/Singapore',
          items: [ { id: calendarId } ]
        }
      } )

      const { data: { calendars = {} } } = response

      const busy = calendars &&  calendars[ calendarId ]?.busy || []

      if( busy.length ) {
        return {
          available: false,
          conflicts: busy
            .filter( ( { start, end } ) => start && end )
            .map( ( { start, end } ) => ( {
              start: start!,
              end: end!
            } ) )
        }
      }

      return {
        available: true
      }
    } catch (error) {
      console.error( `Error checking availability: ${ JSON.stringify( error ) }` )
      throw error
    }
  }

  async findAvailableSlots(
    calendarId: string,
    date: string
  ): Promise< Date[] > {
    try {

      // TODO: This needs to be dynamic based on the teacher's working hours
      // For now, we'll just use the start and end of the day
      const startOfDay = dayjs( date ).startOf( 'day' ).toISOString()
      const endOfDay = dayjs( date ).endOf( 'day' ).toISOString()

      const response = await this.calendar.events.list( {
        calendarId,
        timeMin: startOfDay,
        timeMax: endOfDay,
        timeZone: 'Asia/Singapore',
        singleEvents: true,
        orderBy: 'startTime'
      } )

      const { data: { items = [] } } = response
      const freeSlots: Date[] = []

      let currentTime = dayjs( startOfDay )

      while( currentTime.isBefore( endOfDay ) ) {
        // TODO: Should probably use a constant for the lesson duration
        const slotEnd = dayjs( currentTime ).add( 45, 'minutes' ).toISOString()

        const hasConflict = items.some( item => {
          const eventStart = dayjs( item.start?.dateTime )
          const eventEnd = dayjs( item.end?.dateTime )

          return (
            // Check if the current time is the same as the event start and before the event end
            ( dayjs( currentTime ).isSame( eventStart ) && dayjs( currentTime ).isBefore( eventEnd ) ) ||
            // Check if the current time is after the event start and before the event end
            ( dayjs( slotEnd ).isAfter( eventStart ) && dayjs( slotEnd ).isBefore( eventEnd ) ) ||
            // Check if the current time is the same as the event start and after the event end
            ( dayjs( currentTime ).isSame( eventStart ) && dayjs( slotEnd ).isAfter( eventEnd ) )
          )
        } )

        if( !hasConflict ) {
          freeSlots.push( currentTime.toDate() )
        }

        currentTime = dayjs( currentTime ).add( 45, 'minutes' )
      }

      return freeSlots

    } catch (error) {
      console.error( `Error finding available slots: ${ JSON.stringify( error ) }` )
      throw error
    }
  }
}

export default new CalendarService()