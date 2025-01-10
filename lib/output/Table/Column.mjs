/* Stolen from Table 0bc32b7e620e  Sat May 27 14:44:04 2023 +0100 */

function 
extendArray( array, length, fill )
    {
        for ( let i = array.length; i < length; ++i )
            array[i] = fill;
    }

export default class Column
{
    #name;
    #isIntegerName;
    data;

    // FIXME: a map argument would be nice.
    constructor( columnOrName, rowCountOrData, mapOrValue )
        {
            let data;
            const name = columnOrName instanceof Column ? columnOrName.name : `${columnOrName}`;
            if ( typeof rowCountOrData === 'undefined' ) {
                // We could do this for any iteratble?
                if ( columnOrName instanceof Column ) {
                    data = Array.from( columnOrName.data, mapOrValue );
                } else {
                    data = [];
                }
            // Note that this passes owernership - which is quite common, and make sense,
            // but is really dicy.
            } else if ( Array.isArray( rowCountOrData ) ) {
                data = typeof mapOrValue === 'undefined' ? rowCountOrData : rowCountOrData.map( mapOrValue ) ;
            } else if ( typeof rowCountOrData === 'number' ) {
                if ( rowCountOrData === 0 ) {
                    data = [];
                } else if ( typeof mapOrValue !== 'undefined' && typeof mapOrValue !== 'function' ) {
                    data = Array.from({length:rowCountOrData}, () => mapOrValue );
                } else {
                    data = Array.from({length:rowCountOrData}, mapOrValue );
                }
            } else if ( typeof rowCountOrData?.[Symbol.iterator] === 'function' ) {
                data = Array.from( rowCountOrData, mapOrValue );
            } else {
                throw new TypeError( "Unknown rowCountOrData arg" );
            }
            
            this.#name = name;
            this.data = data;
        }
    get name()
        {
            return this.#name;
        }

    get isIntegerName( )
        {
            return this.#isIntegerName;
        }
    
    /// @brief Set the value at the specified index - extending the row array, if necessary.
    ///
    /// FIXME: we ought to have a default fill for undefined values.
    /// FIXME: do we need support for sparse arrays (i.e. maps?)
    setAt( index, value, fill )
        {
            extendArray( this.data, index - 1, fill );
            this.data[index] = value;
        }
    
    push( value )
        {
            this.data.push( value );
        }
};