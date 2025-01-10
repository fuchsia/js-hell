
export function
isGenerator( object )
    {
        return typeof object === 'object' && object && object[Symbol.toStringTag] === 'Generator';
    }


export function
decapitalise( text )
    {
        if ( !( text.charCodeAt( text ) & 0x40 ) ) 
            return text;
        text = text.charAt( 0 ).toLowerCase() + text.slice( 1 );
        return text;  
    }