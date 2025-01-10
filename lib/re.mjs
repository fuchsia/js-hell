
// 2023_9_12: Used by ./env/parse.mjs and ./args/argtok.mjs
// The file name is a minsomer - it's contains tokenisation features 
// common to both. 

// It might be reasonable to allow `%` for urls - %-encoding.
// And ~home/? (The latter could be restricted to the first char?)
//
// And if we're not going to include '?' as an glob, then release
// them for urls. (We could actually have parsers for each type._ 
//
// - 2024_4_15: the '::' was added because env/parse.mjs parses
//   per command-line tokenisation rules, and '::' is valid end of token
//   sequence. I don't think it's too harmful. Otherwise, we need separate
//   rules. We could modify the tokeniser to allow for this. Or do some
//   re juggling.  
export const
RE_SPECIAL = /[!?$%^=@#~()[\]{}<>&|,;`'"]/,
// Q: Would this be better written as not [^${SPEICAL}]` Or, since these are one char matches
// a match call rather than.  
RE_BAREWORD = new RegExp( `.*?(?=${RE_SPECIAL.source}|\\s|::|$)`, 'y' ),
RE_QUOTE = /(["'])(.*?)\1/sy;

export const 
RE_USAGE_ANNOTATION = /\s+--(?=\s)/y, //< Q: Should we eat trailing WS (i.e. strip leading WS of comment?) 
RE_TO_EOL_EXCLUSIVE     = /.*?(?=\r?\n|$)/y,     
RE_TO_EOL_INCLUSIVE     = /.*?(?:\r?\n|$)/y;     

export const
END_USAGE = "::",
WILDCARD_NAME = "$0";
 
export function
_readAnnotation( term, instr,  ) {
    // Q: Is it worth doing the trim here and making it permament, even if the annotation fails?
    // Otherwise we're re trimming next time around.
    if ( !instr.match( RE_USAGE_ANNOTATION ) ) 
        return term;
    
    // The white space has to be left on for `usage/parse()` - see WS1 for why it needs to be able
    // to see it.
    //
    // FIXME: multi-line annotations, please.
    const annotation = instr.match( RE_TO_EOL_EXCLUSIVE );
    term.annotation = annotation;
    return term;
}

export function 
_readQuotedValueOrBareword( instr ) {
    let quote;
    let value;
    // NB It is the caller's job to check we are at the end of a token.
    if (( quote = instr.exec( RE_QUOTE ) )) {
        return { value: quote[2], quoted: true };
    } else {
        return { value: instr.match( RE_BAREWORD ), quoted: false }; 
    }
    // SHould we spot whitepsace here?
}

export function 
readOptionallyQuotedValue( instr ) {
    const {value,quoted} = _readQuotedValueOrBareword( instr );
    const result = new String( value ); // This will make us super popular...
    result.quoted = quoted; 
    return result;
}
//













