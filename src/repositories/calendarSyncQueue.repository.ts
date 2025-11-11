import dayjs from 'dayjs'
import supabase from '../config/database.js'
import BaseRepository from './base.repository.js'

type Operation = 'create' | 'update' | 'delete'

type SyncStatus = 'pending' | 'in_progress' | 'completed' | 'failed'

interface LessonSnapshot {
  lessonId: string
  scheduledTime: string
  teacherId: string
  teacherName: string
  teacherCalendarId: string
  studentId: string
  studentName: string
  studentPhone: string
  calendarEventId?: string
}

export interface CalendarSyncQueue {
  id: string
  lessonId: string
  operation: Operation
  status: SyncStatus
  retryCount: number
  maxRetries: number
  nextRetryAt: string | null
  lessonSnapshot: LessonSnapshot
  errorMessage?: string
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

// TODO: Add logging
class CalendarSyncQueueRepository extends BaseRepository< CalendarSyncQueue > {
  constructor() {
    super( 'calendar_sync_queue' )
  }

  async queueSync( 
    lessonId: string, 
    operation: Operation, 
    lessonSnapshot: LessonSnapshot,
  ): Promise< CalendarSyncQueue > {
    return this.create( {
      lessonId,
      operation,
      status: 'pending',
      lessonSnapshot,
      createdAt: dayjs().toISOString(),
      updatedAt: dayjs().toISOString(),
      completedAt: null
    } as CalendarSyncQueue )
  }

  async getNextPendingJob(): Promise< CalendarSyncQueue | null > {
    const now = dayjs().toISOString();

    const { data, error } = await supabase
      .from( this.tableName )
      .select( '*' )
      .eq( 'status', 'pending' )
      .or( `next_retry_at.is.null,next_retry_at.lte.${ now }` )
      .order( 'created_at', { ascending: true } )
      .limit( 1 )
      .maybeSingle();

    if ( error ) {
      throw error
    }

    return data as CalendarSyncQueue | null
  }

  async markAsInProgress( jobId: string ): Promise< CalendarSyncQueue > {
    return this.update( 
      jobId, 
      { status: 'in_progress',
        updatedAt: dayjs().toISOString() 
      } as CalendarSyncQueue 
    )
  }

  async markAsCompleted( jobId: string ): Promise< CalendarSyncQueue > {
    return this.update( 
      jobId,
      { status: 'completed',
        updatedAt: dayjs().toISOString(),
        completedAt: dayjs().toISOString()
      } as CalendarSyncQueue 
    )
  }

  async markAsFailed( jobId: string, errorMessage: string ): Promise< CalendarSyncQueue > {
    const job = await this.findById( jobId )

    if ( !job ) throw new Error( 'Job not found' )
    
    const retryCount = job.retryCount + 1

    if( retryCount >= job.maxRetries ) {
      return this.update( 
        jobId,
        { status: 'failed',
          retryCount,
          updatedAt: dayjs().toISOString(),
          errorMessage 
        } as CalendarSyncQueue 
      )
    } else {
      // Calculate next retry with exponential backoff
      // 2^retryCount minutes: 2, 4, 8, 16, 32 minutes
      const nextRetryAt = dayjs().add( Math.pow( 2, retryCount ), 'seconds' ).toISOString()

      return this.update( 
        jobId,
        { status: 'pending',
          retryCount,
          nextRetryAt,
          updatedAt: dayjs().toISOString()
        } as CalendarSyncQueue 
      )
    }
  }

  async findFailedJobs( limit: number = 100 ): Promise< CalendarSyncQueue[] > {

    const { data, error } = await supabase
      .from( this.tableName )
      .select( '*' )
      .eq( 'status', 'failed' )
      .order( 'created_at', { ascending: true } )
      .limit( limit )

    if ( error ) throw error

    return data as CalendarSyncQueue[]
  }

  async findByLessonId( lessonId: string ): Promise< CalendarSyncQueue | null > {

    const { data, error } = await supabase
      .from( this.tableName )
      .select( '*' )
      .eq( 'lesson_id', lessonId )
      .maybeSingle()

    if ( error ) throw error

    return data as CalendarSyncQueue | null
  }

  async getPendingJobsCount(): Promise< number > {

    const { count, error } = await supabase
      .from( this.tableName )
      .select( 'count', { count: 'exact', head: true } )
      .eq( 'status', 'pending' )

    if ( error ) throw error

    return count || 0
  }

  async getFailedJobsCount(): Promise< number > {

    const { count, error } = await supabase
      .from( this.tableName )
      .select( 'count', { count: 'exact', head: true } )
      .eq( 'status', 'failed' )

    if ( error ) throw error

    return count || 0
  }
}

export default new CalendarSyncQueueRepository()