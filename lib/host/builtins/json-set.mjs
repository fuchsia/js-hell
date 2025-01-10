// This should be `json-set JSON_FILE (KEY_NAME|ARRAY_INDEX)... JSON :: default( $jsonFile.json(), $2, $3) as JSON -> $jsonFile`;
// There's also a strong argument we should support xxx > ./file.json/key/key/value 
export const js_hell = `IDL=1 json-set JSON_FILE KEY_NAME... JSON :: default( JSON_FILE.toJSON(), $2, $3) as JSON -> JSON_FILE`;

function 
checkKey( object, key )
    {
        if ( typeof key === 'number' ) {
            if ( !Number.isInteger( key ) || key < 0 )
                throw new TypeError( "Numeric key must be an unsigned integer" );

            if ( !Array.isArray( object ) ) 
                throw new TypeError( "Numeric key requires an array" );
        } else if ( typeof key === 'string' ) {
            // Should we separate out the Array case? 
            if ( typeof object !== 'object' || !object || Array.isArray( object ) ) 
                throw new TypeError( "String key requires a non-null dictionary object" );
        } else {
            throw new TypeError( "`key` must be an unsigned integer or a string" );
        }

    }
 
export default function 
setNestedJson( json, keys, value ) {
    let curObject = json;
    for ( let i = 0; i < keys.length - 1; ++i ) {
        const k = keys[i];
        checkKey( curObject, k );
        curObject = curObject[k];
    }
    const lastKey = keys.at( -1 );
    checkKey( curObject, lastKey );
    curObject[lastKey] = value;
    return json;
}
                
