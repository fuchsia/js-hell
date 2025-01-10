
export default function
Object_in( object, propertyName )
    {
        if ( typeof object === 'object' )
            return object === null ? false : propertyName in object;
        if ( typeof object === 'undefined' )
            return false;
        if ( "preferred method" ) {  
            return propertyName in Object( object );
        } else if ( "alternative - would it be better?" ) {
            do {
                // This can pick up some properties, but not all. E.g. Oject.hasOwn( 4, 'toString' );
                if ( Object.hasOwn( object, propertyName ) )
                    return true;
            } while ( object = Object.getPrototypeOf( object ) );
            return false;
        }
    }


