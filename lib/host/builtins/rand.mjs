

// FIXME: we really want [{MAX_INT|--bits=(8|16|32|64)}]
// FIXME: no way to set a default for MAX_INT.
export const js_hell = `IDL=1
-- Generate COUNT random numbers between 0 and MAX_COUNT (inclusive; 0 <= x <= MAX_COUNT).
-- MAX_COUNT defaults to 255 (i.e. bytes).

rand 
    [--crypto] -- Use \`crypto.getRandomValues()\` instead of \`Math.random()\`; MAX_INT must be set for 8-, 16-, 32- or bit unsigned ints.  
    [MAX_INT] 
    COUNT 
    :: default($2, $1 = 255, {crypto=false})
`;

export default function( count, max = 255, { crypto =false} ){
    if ( !crypto  ) { 
        const result = [];
        for ( let i = 0; i < count; ++i ) {
            result.push( Math.trunc( Math.random() * max ) );
        }
        return result;
    } else {
        let array;
        if ( max === 255  ) {
            array = new Uint8Array( count );
        } else if ( max === 0xffff ) {
            array = new Uint16Array( count );
        } else if ( max === 0xffff_ffff ) {
            array = new Uint32Array( count );
        } else {
            // Can we not use BigUint64Array?
            throw new TypeError( "Illegal maximum value for cryptograph random numbers" );
        }
        globalThis.crypto.getRandomValues( array );
        return array;
    } 
}


