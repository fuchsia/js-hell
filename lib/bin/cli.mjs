#!/usr/bin/env node 
 
// 2024_10_15: Glitch is runnign on node 16.14.2 (long, hard stare ). So polyfill
// this. (I swore off polyfills. I really did.)
if ( typeof Object.groupBy === 'undefined' || globalThis.CHECK_POYFILLS )
    Object.groupBy = (arr, callback) => {
        return arr.reduce((acc, value) => {
          const key = callback( value );
          acc[key] ??= [];
          acc[key].push(value);
          return acc;
        }, {});
      };

// 2024_10_16: As above.
if ( typeof Set.prototype.intersection !== 'function' || globalThis.CHECK_POYFILLS ) 
    Set.prototype.intersection = function( setLike ) {
        const result = new Set;
        for ( const item of setLike ) {
            if ( this.has( item ) )
                result.add( item );
        }
        return result;
    }  

// Disable all warnings. This is guaranteed to work on all platforms; whereas on windows,
// adding `--nowarnings` to the above doesn't.
async function mainWithoutWarnings() {
    process.removeAllListeners('warning');
    const mainModule = await import( "../host/main.mjs" ); 
    const exitcode = await mainModule.default();
    process.exit( exitcode );
}

mainWithoutWarnings();
