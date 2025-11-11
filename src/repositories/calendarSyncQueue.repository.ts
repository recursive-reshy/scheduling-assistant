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
    return this.update( jobId, { status: 'in_progress' } as CalendarSyncQueue )
  }

  async markAsCompleted( jobId: string ): Promise< CalendarSyncQueue > {
    return this.update( jobId, { status: 'completed' } as CalendarSyncQueue )
  }

  async markAsFailed( jobId: string, errorMessage: string ): Promise< CalendarSyncQueue > {
    return this.update( jobId, { status: 'failed', errorMessage } as CalendarSyncQueue )
  }
}