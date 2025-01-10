import {valueForEquals,_typeof_,realiseTo} from "../consts.mjs";

// 2024_8_22: Tests for this are in IDL. (And possibly elsewhere.) 
export default class
Integer {
    #safe;
    #value;
    constructor( text )
        {
            const value = Number( text ),
                  safe = Number.isSafeInteger( value  );
            
            this.#value = safe ? value : BigInt(text);
            this.#safe = safe; 
        }
    
    static fromString( text )
        {
            // FIXME: we should validate here.
            return new Integer( text );
        }

    toSafeInteger()
        {
            if ( !this.#safe )
                throw new TypeError( "Integer is too big to be safely encoded as a number" );
            return this.#value;
        }

    toNumber()
        {
            return Number( this.#value );
        }
    
    toBigInt()
        {
            return BigInt( this.#value );
        }

    // Doing this on the prototype, prevents overwriting, I think.
    get [realiseTo]() {
        return "SafeInteger";
    }
    get [_typeof_]( ) {
        // 2024_8_22: We previously faked an integer type; this seems more sensible.
        return this.#safe ? "number" : "bigint";
    }
    // Q: Do we need a full blown overload here? If so how do we handle `4 === Integer(4)`?
    [valueForEquals]() {
        return this.#value;
    }
};      
