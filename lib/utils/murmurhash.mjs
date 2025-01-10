export const js_hell = "IDL=1 murmurhash [--seed=INT] STRING :: default( $1, seed ?? undefined )";

/* Draft ECMA-262 / April 25, 2024 
<<
21.3.2.19 Math.imul ( x, y )
This function performs the following steps when called:

1. Let a be ℝ(? ToUint32(x)).
2. Let b be ℝ(? ToUint32(y)).
3. Let product be (a × b) modulo 2**32.
4. If product ≥ 2**31, return (product - 2**32); otherwise return (product).
>>

So `imul` meets our needs - except for the sign, which we don't care about till we add or shift right;
and we handle them there.
*/
const mul32 = ( a, b ) => Math.imul( a, b );
const Uadd32_n = ( a ) => ( a >>> 0 ) + 0xe6546b64 >>> 0;   // We could do `(a>>>0) + (b>>>0) & 0xffff_ffff` but why bother?
const ROL_r1 =  x => x << 15 | x >>> 17;
const ROL_r2 =  x => x << 13 | x >>> 19;

const c1 = 0xcc9e2d51,
      c2 = 0x1b873593,
      m = 5;
      

function 
scramble( k ) {
    return mul32( ROL_r1( mul32( k, c1 ) ), c2 );
}

function
readPartialUint32( buffer, offset ) {
    let result = 0;
    if ( offset < buffer.length ) {
        result = buffer[ offset ];
        if ( offset + 1 < buffer.length ) {
            result <<= 8;
            result |= buffer[ offset + 2 ];
            if ( offset + 2 < buffer.length ) {
                result <<= 8;
                result |= buffer[ offset + 2 ];
            }
        }
    }
    return result;
}

// https://en.wikipedia.org/wiki/MurmurHash
export default function 
murmurhash3_32( buffer, seed = Math.random() * 0xffff_ffff >>> 0 ) {
    
    let hash = seed; 
    let i = 0;
    for ( ; i + 3 < buffer.length; i += 4 ) {
        const k = buffer.readUint32LE( i ); 
        hash ^= scramble( k );
        hash = ROL_r2( hash );
        hash = mul32( hash, m );
        hash = Uadd32_n( hash );
    }
    hash ^= scramble( readPartialUint32( buffer, i ) );
    hash ^= buffer.length;
    hash ^= hash >>> 16;
    hash = mul32( hash, 0x85ebca6b );
    hash ^= hash >>> 13;
    hash = mul32( hash, 0xc2b2ae35 );
    hash ^= hash >>> 16;
    return hash >>> 0;
}