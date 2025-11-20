import dayjs from 'dayjs'
// Services
import sheetCacheService from './sheetCache.service.js'
// Repositories
import lessonRepository, { Lesson, LessonStatus } from '../repositories/lesson.repository.js'
// Services
import calendarService from './calendar.service.js'

// TODO: Think of a better name for this
// Common response for CRUD operations
interface CrudResponse { 
  success: boolean
  message: string
  lesson?: Lesson
}

class LessonService {

  async createLesson( 
    studentPhone: string,
    teacherId: string,
    scheduledTime: string | Date
  ): Promise< Lesson > {

    const startTime = typeof scheduledTime == 'string' ? 
      dayjs( scheduledTime ).toISOString() 
    : 
      scheduledTime.toISOString()

    // Validate that student exists
    const student = await sheetCacheService.getStudentByPhoneNumber( studentPhone )

    // TODO: Might want to add student to spreadsheet if they don't exist. Future improvement
    if( !student ) {
      throw new Error( `Student not found for phone number: ${ studentPhone }` )
    }

    // Validate that teacher exists
    const teacher = await sheetCacheService.getTeacherById( teacherId )

    if( !teacher ) {
      throw new Error( `Teacher not found for id: ${ teacherId }` )
    }

    // Check availability of teacher
    const availability = await calendarService.checkAvailability( teacher.google_calendar_id, startTime )

    if( !availability.available ) {
      console.log( `Teacher ${ teacherId } not available at ${ startTime }: ${ JSON.stringify( availability.conflicts ) }` )
      throw new Error( `Teacher not available at ${ startTime }` ) 
    }

    // If teacher is available, create a pending lesson first
    // Once teacher confirms, create calendar event
    const { student_id, phone_number: student_phone } = student
    const { teacher_id, phone_number: teacher_phone, google_calendar_id } = teacher

    // TODO: Notify teacher for approval
    
    // Create lesson
    const lesson = await lessonRepository.createLesson( {
      student_id,
      student_phone,
      teacher_id,
      teacher_phone,
      scheduled_time: startTime,
      status: LessonStatus.PENDING,
      created_at: dayjs().toISOString(),
      updated_at: dayjs().toISOString()
    } )

    console.log( `Lesson created: ${ JSON.stringify( lesson ) }` )

    // TODO: Send confirmation message to student and teacher
    return lesson
  }

  async cancelLesson( lessonId: string ): Promise< CrudResponse > {
    const lesson = await lessonRepository.findById( lessonId )

    if( !lesson ) {
      throw new Error( `Lesson not found for id: ${ lessonId }` )
    }

    const teacher = await sheetCacheService.getTeacherById( lesson.teacher_id )

    if( !teacher ) {
      throw new Error( `Teacher not found for id: ${ lesson.teacher_id }` )
    }

    // If lesson has a calendar event, delete it
    if( lesson.google_calendar_event_id ) {
      await calendarService.deleteEvent( teacher.google_calendar_id, lesson.google_calendar_event_id )
    }

    const cancelledLesson = await lessonRepository.cancelLesson( lessonId )

    return {
      success: true,
      message: `Lesson cancelled: ${ lessonId }`,
      lesson: cancelledLesson
    }
  }

  async confirmLesson( lessonId: string, teacherId: string ): Promise< CrudResponse > {
    const lesson = await lessonRepository.findById( lessonId )

    if( !lesson ) {
      throw new Error( `Lesson not found for id: ${ lessonId }` )
    }

    if( lesson.teacher_id != teacherId ) {
      throw new Error( `Lesson not found for teacher: ${ teacherId }` )
    }

    if( lesson.status != LessonStatus.PENDING ) {
      return {
        success: false,
        message: `Lesson is already ${ lesson.status }`
      }
    }
    
    const teacher = await sheetCacheService.getTeacherById( teacherId )

    if( !teacher ) {
      throw new Error( `Teacher not found for id: ${ teacherId }` )
    }

    if( !teacher.google_calendar_id ) {
      throw new Error( `Teacher has no google calendar id` )
    }

    // Create calendar event
    const calendarEvent = await calendarService.createEvent( 
      teacher.google_calendar_id, 
      { summary: `Objective Guitar: ${ lesson.student_phone }`, 
        start: lesson.scheduled_time,
        description: `Student: ${ lesson.student_phone }\nPH: ${ lesson.student_phone }` 
      }
    )

    const confirmedLesson = await lessonRepository.confirmLesson( lessonId, calendarEvent.id )

    return {
      success: true,
      message: `Lesson confirmed: ${ lessonId }`,
      lesson: confirmedLesson
    }
  }
}

export default new LessonService()