
const JS_IDENTIFIER_CHAR = /[A-Za-z0-9_$]/y;

function
test( keyword, text, lastIndex )
    {
        if ( !text.startsWith( keyword, lastIndex ) )
            return 0;
        // Check the keyword identifier ends.
        JS_IDENTIFIER_CHAR.lastIndex = lastIndex + keyword.length;
        return !JS_IDENTIFIER_CHAR.test( text ) ? keyword.length : 0;
    }

// Q: Why is this not a class?
// A: Laziness. See the `Keyword(x)` in the code. 
export default function
Keyword( keyword ) {
    return ( text, lastIndex ) => test( keyword, text, lastIndex );  
}
