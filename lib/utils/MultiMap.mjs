
function 
*_enumAll( entry ) {
    do {
        yield entry;
    } while ( entry = entry.next );
}

function 
*enumAll( index, key ) {
    if ( !index.has( key ) ) 
        return;
    yield *_enumAll( index.get( key ) ); 
}

function 
getAll( index, key ) {
    return Array.from( enumAll( index, key ), ({value}) => value );
}

function 
last( index, key ) {
    for ( const entry of enumAll( index, key ) ) {
        if ( !entry.next )
            return entry;
    }
}

/// @brief This follows the pattern of UrlSearchParams/FormData etc...
///
export default class 
MultiMap {
    #entries = new Set; 
    #index = new Map;

    get size() {
        return this.#entries.size;
    }
    has( key ) {
        return this.#index.has( key );
    }

    get( key ) {
        if ( !this.#index.has( key ) )
            return;
        return this.#index.get( key ).value;
    }
    /// @brief Like getAll(), except an iteratory.
    enumAll( key ) {
        return enumAll( this.#index, key ).map( ({value}) => value ); 
    }
    /// @brief As per the various implementations (UrlParams, FormData ) return all the entries
    /// as a key.
    getAll( key ) {
        return getAll( this.#index, key );
    }
    
    set( key, value ) {
        for ( const entry of enumAll( this.#index, key ) ) 
            this.#entries.delete( entry ); 
        const newEntry = {key,value,next:null}; 
        this.#entries.add( newEntry );
        this.#index.set( key, newEntry );
    }
        
    append( key, value ) {
        const newEntry = {key,value,next:null}; 
        this.#entries.add( newEntry );
        if ( !this.#index.has( key ) ) {
            this.#index.set( key, newEntry );
        } else {
            last( this.#index, key ).next = newEntry;
        }
    }

    delete ( key ) {
        for ( const entry of enumAll( this.#index, key ) ) {
            this.#entries.delete( entry );
        }
        this.#index.delete( key );
    }
    *entries( ) {
        for ( const {key,value} of this.#entries ) {
            yield [key,value];
        }
    }

    keys() {
        return this.#index.keys();
    }

    /// @brief The values, returned as an array, filtered
    /// to those where getAll().length > 1 
    ///
    /// Currently used by PositionalTree. 
    *multipleValues( ) {
        for ( const entry of this.#index.values() ) {
            if ( !entry.next )
                continue;
            yield Array.from( _enumAll( entry ), ({value}) => value );
        }
    }
};