/// @brief The javalin Math library. We bill our own library as a module
/// so that (a) it is a namespace and (b) so we don't have to monkey-patch Math.  
 
export const {abs,ceil,clz32,floor,imul,log2,max, min,pow,random,round,sign,trunc,} = Math;

// Q: Should we exclude NaNs?
export function
sum( ...args )
    {
        let accumulator = 0;
        for ( const a of args ) 
            accumulator += Number( a );
        return accumulator;
    }

// We already have Math.imul
export function
product( ...args )
    {
        let accumulator = 1;
        for ( const a of args ) 
            accumulator *= a;
        return accumulator;
    }

   
export function
bits( ...args )
    {
        let accumulator = 0;
        for ( const b of args )
            accumulator |= 1 << b;
        return accumulator;
    }


export const
    // Missing arithmetic
    neg = x => -x,
    reciprocal = x => 1/x,
    diff = ( a, b ) => a - b, 
    // Lazy but useful and also documents the semantics.  
    percent = x => x / 100,
    // We will coerce, as every other numeric operator coerces, but we aren't Object.is().
    // NB Greater-and-equal and less-than-equal can be implemented via Math.max/Math.min
    // We could do with `Boolean.not()` e.g `Boolean.not(Math.equal(x,y))` 
    equal = ( x,y ) => Number( x ) === Number( y ),
    div = ( x, y ) => x / y,
    
    quotient = ( x, y ) => x / y,
    random32 = () => Math.random() * 0xffff_ffff >>> 0;
     

    