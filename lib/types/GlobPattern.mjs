import {toRegExp} from "../glob.mjs";
const realiseTo = Symbol.for( "js-hell.realiseTo" );

export default
class GlobPattern
{
    #text;
    constructor( textOrGlobPattern )
        {
            this.#text = `${textOrGlobPattern}`;
        }

    static fromString( text )
        {
            // 2022_10_6: There are cases where we are called with Globs.
            return new GlobPattern( text );
        }
    
    toString()
        {
            return this.#text;
        }

    toRegExp()
        {
            return toRegExp( this.#text );
        }

    static [realiseTo] = 'String';
 };