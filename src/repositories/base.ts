import supabase from '../config/database.js'


// TODO: Add logging
export class BaseRepository< T > {
  private tableName: string

  constructor( tableName: string ) {
    this.tableName = tableName
  }

  async findAll(limit: number = 100 ): Promise< T[] > {
    const { data, error } = await supabase
      .from( this.tableName )
      .select( '*' )
      .limit( limit )

    if ( error ) throw error

    return data as T[]
  }

  async findById( id: string ): Promise< T | null > {
    const { data, error } = await supabase
      .from( this.tableName )
      .select( '*' )
      .eq( 'id', id )
      .single()

    if ( error ) throw error

    return data as T
  }

  async create( data: T ): Promise< T > {
    const { data: result, error } = await supabase
      .from( this.tableName )
      .insert( data )
      .select()
      .single()

    if ( error ) throw error

    return result as T
  }

  async update( id: string, data: T ): Promise< T > {
    const { data: result, error } = await supabase
      .from( this.tableName )
      .update( data )
      .eq( 'id', id )
      .select()
      .single()

    if ( error ) throw error

    return result as T
  }

  async delete( id: string ): Promise< void > {
    const { error } = await supabase
      .from( this.tableName )
      .delete()
      .eq( 'id', id )

    if ( error ) throw error
  }
}