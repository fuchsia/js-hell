import {parseInvocation} from "../main.mjs";
import {parseText,ARG_POSITIONAL_VALUE} from "../../args/argtok.mjs";
import {USE_JS_HELL_SCRIPTLET} from "../config.mjs";

// NB THIS IS SPECIALLY HANDLED. It gets the command tail passed to us; it's effectively
// `js-hell ...` All the options etc... are visible as $1
//
// The long term aim has got to be that PRE_SCRIPTLET_OPTIONS are passed here and handed to us. 
// But...
export const js_hell = `IDL=1 js-hell :: default( $1, {cwd} )`; // It has ...args implied on the end and is `as any`.

export default 
function( argIterator, options = {} ) {
    if ( !USE_JS_HELL_SCRIPTLET )
        throw new Error( "Shouldn't be reachable" );

    const args = Array.from( argIterator );
    const subshell = parseInvocation( 
        // If the argv was ["node","js-hell","--xxx some thing"] we see the last thing as an option;
        // so a single arg is, for the time being, treated as text no matter what. I don't think this
        // is harmful. (Q: is that actually an error anyway? `node js-hell '"--stacktrace cmd"'` feels
        // wrong. )
        args.length === 1 /*&& args[0].type === ARG_POSITIONAL_VALUE*/ ? parseText( args[0].value) 
        : args.values(), {jsHellAllowed: true} );
     
    return subshell; 
}