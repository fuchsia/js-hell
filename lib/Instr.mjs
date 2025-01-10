const DEBUG = false;
const RE_WS = /\s+/y;

function 
testRegex( expr, text, pos = 0 )
    {
        expr.lastIndex = pos;
        return expr.test( text ) ? expr.lastIndex - pos : 0;
    }

function 
test( expr, text, pos = 0 )
    {
        if ( typeof expr === 'string' ) {
            return text.startsWith( expr, pos ) ? expr.length : 0;
        } else if ( typeof expr === 'function' ) {
            const matchLength = expr( text, pos );
            if ( !Number.isInteger( matchLength ) || matchLength < 0 || pos + matchLength > text.length )
                throw new TypeError( "Invalid matcher result" );
            return matchLength;
        } else {
            // Remove a pointless thing for regexp-like.
            if ( typeof expr.sticky !== 'undefined' && expr.sticky !== true ) 
                throw new TypeError( "RegExp-like must be sticky" );
            return testRegex( expr, text, pos ); 
        }
    }
 
export default class Instr {
    #text;
    #pos;
    #ws;
    #autoTrim;
    #lastIndex;
    constructor( text, { pos = 0, ws = RE_WS, autoTrim = false, trimStart = autoTrim } = {} )
        {
            this.#text = text;
            this.#pos =  !trimStart ? pos : pos + testRegex( ws, text, pos );
            this.#autoTrim = autoTrim;
            this.#ws = ws;
            this.#lastIndex = this.#pos; 
        }

    // 2025_1_8: Is asnybody in js-hell using the object version?
    // i.e. anything other than a boolean?
    match( expr, modeOrTrimTrailing = this.#autoTrim )
        {
            const {trimEnd=false,lookahead=false} = typeof modeOrTrimTrailing !== 'object' || !modeOrTrimTrailing ? { trimEnd: !!modeOrTrimTrailing, lookahead: false } : modeOrTrimTrailing;  
            // We could do trimStart - i.e. before we match. But is that worthwhile?                                   
            const pos = this.#pos, 
                  text = this.#text;
            const matchLength = test( expr, text, pos );
            DEBUG && console.log( "result", expr, "->", JSON.stringify( text.slice( pos, pos + matchLength ) ), lookahead, trimEnd );
            // I didn't want to do lookahead but it is so trivial.
            if ( !matchLength )
                return '';
            const end = pos + matchLength;
            if ( !lookahead ) {
                this.#lastIndex = pos;
                // Q: Why use `testRegex` and not `test`? A function might occasionally be helpful.
                this.#pos = !trimEnd ? end : end + testRegex( this.#ws, text, end );
            }
            return typeof expr === 'string' ? expr : text.slice( pos, end );
        }
    
    // Strong discouraged. It's a pain it even exists. But occasioanlly capture groups make life easier.
    exec( expr, modeOrTrimTrailing = this.#autoTrim )
        {
            const {trimEnd=false,lookahead=false} = typeof modeOrTrimTrailing !== 'object' || !modeOrTrimTrailing ? { trimEnd: !!modeOrTrimTrailing, lookahead: false } : modeOrTrimTrailing;
            if ( expr.sticky !== true ) 
                throw new TypeError( "Must be a sticky RegExp-like" );
            const text = this.#text, pos = this.#pos;
            expr.lastIndex = pos;
            const result = expr.exec( text );
            if ( !lookahead && result ) {
                const end = expr.lastIndex;
                this.#lastIndex = pos;
                this.#pos = !trimEnd ? end : end + testRegex( this.#ws, text, end );
            }
            return result;
        }
    
    startsWith( expr )
        {
            const matchLength = test( expr, this.#text, this.#pos );
            return matchLength !== 0; 
        }

    trimStart()
        {
            const matchLength = testRegex( this.#ws, this.#text, this.#pos );
            return matchLength ? ( this.#pos += matchLength, true ) : false;
        }
    
    get lastIndex()
        {
            return this.#lastIndex;
        }
    
    get pos()
        {
            return this.#pos;
        }

    
    getPos()
        {
            return this.#pos;
        }
    
    atEof()
        {
            return this.#pos >= this.#text.length;
        }

    slice( pos )
        {
            const at = this.#pos;
            return !( pos > at ) ? this.#text.slice( pos, at ) : this.#text.slice( at, pos );
        }
    
    // 2024_4_15: Pure diagnostic.
    // 2024_10_19: Used in main because of crappy slice semantics.
    tail() {
        return this.#text.slice( this.#pos );
    }
    
    // cf lastIndex - if the token read was in error.
    error( message, startIndex = this.#pos, endIndex = this.#pos )
        {
            if ( startIndex < 0 )
                startIndex += this.#pos;
            // 2025_1_8: I have know idea why endIndex was chosen here;
            // This should be startIndex, I suspect.
            //
            // Also, this is zero based and misleading. So I think
            // remove this at rely on processor to point out the position.
            message += ` at ${endIndex}`;
            const err = new Error( message );
            err.type = 'parse';
            err.sourceIndex = startIndex;
            err.sourceStartIndex = startIndex;
            err.sourceEndIndex = endIndex;
            err.sourceText = this.#text;
            return err;
        }

    warn( message, startIndex )
        {
            const err = this.error( message, startIndex );
            console.warn( err.message );
        }
    
    getText()
        {
            return this.#text;
        }

    // magic:

    // getPos and pos are available. Do away with?
    fence() 
        {
            return this.#pos;
        }
    
    // replace this with set pos or setter for pos?
    rollback( pos = this.#lastIndex )
        {
            this.#pos = pos;
        }
    

};

export class 
Until {
    #text;
    lastIndex = 0;
    constructor( text )
        {
            // Would we be better off using:
            // new RegExp( `.*?(?=${RegExp.quote(text)})`, 'y' );
            this.#text = text;
        }
    
    test( text )
        {
            const matched = text.indexOf( this.#text, this.lastIndex );
            if ( matched === -1 )
                return false;
            this.lastIndex = matched;
            return false;
        }
    
};



