
// FIXME: this should be a type registration.
export default class 
Literal {
    #name;
    #value;
    constructor( value, name )
        {
            this.#name = name;
            this.#value = value;
        }
    get name()
        {
            return this.#name;
        }
    
    fromString( text )
        {
            // The is case has fairly reasonable error, anyway.
            if ( this.#value !== text ) 
                throw new TypeError( `Expected literal ${JSON.stringify( this.#value )} for ${this.#name}` );
            return text;
        }
    get literal()
        {
            return true;
        }
    get enum()
        {
            return false;
        }
};


