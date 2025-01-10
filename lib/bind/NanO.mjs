import {realiseTo} from "../symbols.mjs";
export const 
OUT_OF_RANGE = "range",
MISSING_PROPERTY = "property",
MISSING_METHOD = "method",
MISSING_GLOBAL = "global";

function isException( type ) {
    return type === MISSING_METHOD; 
}
        
/// @brief "Not an Object". Behaves roughly like a NaN - passing through things
/// unless used by '??' and eventually triggering an error.
///
/// 2024_8_21: P1: This exists because I forgot `ReferenceError` exists 
/// and we could legitimately throw a ReferenceError. (e.g. I've just doen `xyz` in 
/// Chrome's browser console and it threw a ReferenceError. We wanted the same.)
/// 
/// That said, it tracks conditions like `Number.xyz`, and `x[5]` where 5 is beyond
/// the end. It's becoming our ErrorCompletion class - I'm not sure whether that's
/// a good thing or not.
///
/// Q: should this be `instanceof Error`? 
export default class 
NanO {
    [realiseTo] = 'Error';
    #type;
    #propertyName;
    #objectName;
    #isException;            //< boolean: if we were in javascript, would we return an error? (true) 
                            // Or would it be undefined? (false) 
    
    constructor( type, propertyName = "", objectName = "", exception = isException( type ) )
        {
            this.#type = type;
            this.#propertyName = propertyName;
            this.#objectName = objectName;
            this.#isException = exception; 
        }

    // 2022_10_5: Handy for testing. We can check the error.
    getType()
        {
            return this.#type;
        }
    
    /// @brief If we were in a javascript context, would this be an exception (true) or undefined (false)
    get isException() {
        return this.#isException; 
    }
    /// @brief Force this to be an error.
    ///
    /// Contrast `typeof Number.foo` and `typeof Number.foo.bar`; the former is undefined and the latter
    /// an exception. This allows us to convert a catchable NanO into an uncatchable NanO while still 
    /// pointing to the original error (that `Number.foo` doesn't exist.) 
    ///
    /// 2024_8_21: This is a late addition and probably missing all over the place. It currently only matters 
    /// for `typeof` (although the plan is to adept `??` so it only catches non-exceptions.)
    convertToException() {
        this.#isException = true;
    }
    
    getMessage()
        {
            if ( this.#type === MISSING_GLOBAL ) { 
                return `Missing parameter ${JSON.stringify(this.#propertyName)}`;
            } else if ( this.#type === MISSING_PROPERTY ) {
                return this.#objectName 
                ? `No property ${JSON.stringify(this.#propertyName)} in ${JSON.stringify(this.#objectName)}`
                : `No property ${JSON.stringify(this.#propertyName )}`
            } else if ( this.#type === MISSING_METHOD  ) {
                return `No method ${this.#propertyName}() on instance of ${this.#objectName}`; 
            } else if ( this.#type === OUT_OF_RANGE ) {
                return "Index out of range";
            }  else if ( this.#type === 'unindex' ) {
                return "Not an indexable property";
            } else if ( this.#type === 'cast' ) {
                 return`Cannot cast from ${JSON.stringify(this.#objectName )} to ${JSON.stringify(this.#propertyName)}`
            } else {
                return `Not an object (JSON.stringify(this.#type)}`;
            }  
        }
    
    toError()
        {
            // This has to throw. We're abusing the realisation machinary.
            return this.#type === MISSING_GLOBAL ? ReferenceError( this.getMessage( ) ) : TypeError( this.getMessage() );
        }
    
    // Should this really be castable to bool? 
    // If not. `x to Bool ? true : true ?? false` can be used to cateogorical identify us. 
    toBoolean()
        {
            return false;
        }
    
    static fromMissingGlobal( name )
        {
            return new NanO( MISSING_GLOBAL, name, "", false );
        }

    static fromMissingProperty( propertyName, objectName  )
        {
            return new NanO( MISSING_PROPERTY, propertyName, objectName, false );
        }
    
    static fromMissingMethod( methodName, objectClassName )
        {
            return new NanO( MISSING_METHOD, methodName, objectClassName, true );
        }

    static fromIndexOutOfRange()
        {
            return new NanO( OUT_OF_RANGE, "", "", false );
        }
    
    static fromUnindex()
        {
            return new NanO( "unindex" );
        }
    
    static fromMissingCast( from, to )
        {
            return new NanO( "cast", to, from );
        }

};

