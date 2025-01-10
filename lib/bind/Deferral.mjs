
/// @brief A promise that the user has NOT waited on.
class Deferral2 {
    #promise;
    
    constructor( promise ) {
        this.#promise = promise;
    }
    get() { return this.#promise }
};

export function 
unwrap( value ) {
    if ( value instanceof Deferral2 ) {
        return value.get();
    } else {
        return value;  
    }
}

export function 
wrap( value ) {
    if ( value instanceof Promise ) {
        return new Deferral2( value );
    } else {
        return value;
    }
}


export function
unwrapAll( array ) {
    return array.map( d => unwrap( d  ) );
}
