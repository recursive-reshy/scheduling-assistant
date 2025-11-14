import dayjs from 'dayjs'
// Services
import sheetsService, { SheetRow } from './sheets.service.js'

interface Teacher {
  teacher_id: string
  name: string
  phone_number: string
  google_calendar_id: string
  active: boolean
}

interface Student {
  student_id: string
  name: string
  phone_number: string
  teacher_id: string
  active: boolean
}

// TODO: Add logging
class SheetCacheService {
  private teacherCache: Teacher[] = []
  private studentCache: Student[] = []

  private lastSync: Date | null = null

  // TODO: Make this configurable
  private readonly CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

  private readonly TEACHERS_SPREADSHEET_ID = process.env.GOOGLE_TEACHERS_SPREADSHEET_ID!
  private readonly STUDENTS_SPREADSHEET_ID = process.env.GOOGLE_STUDENTS_SPREADSHEET_ID!

  // Twilio needs the phone number to be in the format of whatsapp:+1234567890
  // Might remove once migrated to meta whatsapp APIs
  private normalizePhoneNumber( phoneNumber: string ): string {
    if( !phoneNumber.startsWith( 'whatsapp:' ) ) {
      return `whatsapp:${ phoneNumber }`
    }
    return phoneNumber
  }

  async refreshCache(): Promise<void> {
    try {
      const teachers = await sheetsService.getTeacherSheet( this.TEACHERS_SPREADSHEET_ID)

      this.teacherCache = teachers.map( ( { teacher_id, name, phone_number, google_calendar_id, active }: SheetRow ) => ( {
        teacher_id: teacher_id as string,
        name: name as string,
        phone_number: this.normalizePhoneNumber( phone_number as string ),
        google_calendar_id: google_calendar_id as string,
        active: active as boolean
      } ) )
      
      const students = await sheetsService.getStudentSheet( this.STUDENTS_SPREADSHEET_ID )
      this.studentCache = students.map( ( { student_id, name, phone_number, teacher_id, active }: SheetRow ) => ( {
        student_id: student_id as string,
        name: name as string,
        phone_number: this.normalizePhoneNumber( phone_number as string ),
        teacher_id: teacher_id as string,
        active: active as boolean
      } ) )

      this.lastSync = dayjs().toDate()
    } catch (error) {
      console.error( `Error refreshing cache: ${ JSON.stringify( error ) }` )
      throw error
    }
  }
  
  async ensureCacheUpdated(): Promise<void> {
    const now = dayjs()
    
    if(
      !this.lastSync ||
      !this.teacherCache.length ||
      !this.studentCache.length ||
      now.diff( dayjs( this.lastSync ), 'ms' ) > this.CACHE_TTL_MS
    ) {
      await this.refreshCache()
    }
  }

  async getStudentByPhoneNumber( phoneNumber: string ): Promise< Student | null > {
    await this.ensureCacheUpdated()

    const normalizedPhone = this.normalizePhoneNumber( phoneNumber )

    const student = this.studentCache.find( ( { phone_number, active} ) => phone_number == normalizedPhone && active )

    if( !student ) {
      console.log( `No active student found for phone number: ${ normalizedPhone }` )
      return null
    }

    console.log( `Found active student: ${ student.name } with phone number: ${ normalizedPhone }` )
    return student
  }

  async getTeacherById( teacherId: string ): Promise< Teacher | null > {
    await this.ensureCacheUpdated()

    const teacher = this.teacherCache.find( ( { teacher_id, active} ) => teacher_id == teacherId && active )

    if( !teacher ) {
      console.log( `No active teacher found for id: ${ teacherId }` )
      return null
    }

    console.log( `Found active teacher: ${ teacher.name } with id: ${ teacherId }` )
    return teacher
  }

  async getTeacherByPhoneNumber( phoneNumber: string ): Promise< Teacher | null > {
    await this.ensureCacheUpdated()

    const normalizedPhone = this.normalizePhoneNumber( phoneNumber )

    const teacher = this.teacherCache.find( ( { phone_number, active} ) => phone_number == normalizedPhone && active )
    
    if( !teacher ) {
      console.log( `No active teacher found for phone number: ${ normalizedPhone }` )
      return null
    }

    console.log( `Found active teacher: ${ teacher.name } with phone number: ${ normalizedPhone }` )
    return teacher
  }

  async getAllTeachers(): Promise< Teacher[] > {
    await this.ensureCacheUpdated()
    return this.teacherCache.filter( ( { active } ) => active )
  }

  async getAllStudents(): Promise< Student[] > {
    await this.ensureCacheUpdated()
    return this.studentCache.filter( ( { active } ) => active )
  }

  async getStudentsByTeacher( teacherId: string ): Promise< Student[] > {
    await this.ensureCacheUpdated()
    return this.studentCache.filter( ( { teacher_id, active } ) => teacher_id == teacherId && active )
  }

  async forceRefreshCache(): Promise< void > {
    this.lastSync = null
    await this.refreshCache()
  }
}

export default new SheetCacheService()