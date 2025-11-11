import dayjs from 'dayjs'
import supabase from '../config/database.js'
import BaseRepository from './base.repository.js'

export enum LessonStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  CANCELLED = 'cancelled'
}

export interface Lesson {
  id: string
  studentId: string
  studentPhone: string
  teacherId: string
  teacherPhone: string
  scheduledTime: string
  status: LessonStatus
  googleCalendarEventId: string | undefined
  createdAt: string
  updatedAt: string
}

// TODO: Add logging
class LessonRepository extends BaseRepository< Lesson > {
  constructor() {
    super( 'lessons' )
  }

  async findConflicts( teacherId: string, scheduledTime: string ): Promise< Lesson[] > {

    const startTime = dayjs( scheduledTime ).startOf( 'hour' ).toISOString()
    const endTime = dayjs( startTime ).add( 1, 'hour' ).toISOString()
    
    const { data, error } = await supabase
      .from( this.tableName )
      .select( '*' )
      .eq( 'teacher_id', teacherId )
      .in( 'status', [ LessonStatus.PENDING, LessonStatus.CONFIRMED ] )
      .gte( 'scheduled_time', startTime ) // Start time
      .lte( 'scheduled_time', endTime ) // End time

    if ( error ) throw error

    return data as Lesson[]
  }

  async findByTeacherAndDate( teacherId: string, date: string ): Promise< Lesson[] > {
    
    const startOfDay = dayjs( date ).startOf( 'day' ).toISOString()
    const endOfDay = dayjs( date ).endOf( 'day' ).toISOString()
    
    const { data, error } = await supabase
      .from( this.tableName )
      .select( '*' )
      .eq( 'teacher_id', teacherId )
      .gte( 'scheduled_time', startOfDay )
      .lte( 'scheduled_time', endOfDay )
    
    if ( error ) throw error

    return data as Lesson[]
  }

  async createLesson( lesson: Lesson ): Promise< Lesson > {
    return this.create( lesson )
  }

  async confirmLesson( lessonId: string, googleCalendarEventId?: string): Promise< Lesson > {
    return this.update( lessonId, { status: LessonStatus.CONFIRMED, googleCalendarEventId } as Lesson )
  }

  async cancelLesson( lessonId: string ): Promise< Lesson > {
    return this.update( lessonId, { status: LessonStatus.CANCELLED } as Lesson )
  }

  async findByStudentId( studentId: string, limit: number = 50 ): Promise< Lesson[] > {
    
    const { data, error } = await supabase
      .from( this.tableName )
      .select( '*' )
      .eq( 'student_id', studentId )
      .limit( limit )
      .order( 'scheduled_time', { ascending: false } )

    if ( error ) throw error

    return data as Lesson[]
  }

  async findByTeacherId( teacherId: string, limit: number = 50 ): Promise< Lesson[] > {
    
    const { data, error } = await supabase
      .from( this.tableName )
      .select( '*' )
      .eq( 'teacher_id', teacherId )
      .limit( limit )
      .order( 'scheduled_time', { ascending: false } )
    
    if ( error ) throw error

    return data as Lesson[]
  }
}

export default new LessonRepository()