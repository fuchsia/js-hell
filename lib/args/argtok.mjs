import Instr from "../Instr.mjs";
import {RE_BAREWORD,RE_SPECIAL,_readQuotedValueOrBareword} from "../re.mjs";
 import Binding from "../bind/Binding.mjs"; 
import {isLiteral} from "../bind/ast.mjs"; 
export const
// FIXME: the positional/named dichotomy is a mistake. See INFO. Ot better yet switch to `ARG_NAME_WITH_VALUE` and `ARG_NAME_ONLY` and handle it
// there. But not time to do that now. 
ARG_POSITIONAL_VALUE = '$n', 
ARG_NAMED_VALUE = '=', 
ARG_NAME = '--$',
ARG_OPERATOR = ';',
ARG_POSITIONAL_EXPR = '${}',
ARG_NAMED_EXPR = '=${}';

export const 
RE_OPTION = new RegExp( `-${RE_BAREWORD.source}`, 'y' ),
// 2024_10_14: We used to reject unsupported operators (like `>>`) here
// but it makes for unhelpful error messages. So we move it up the chain.
// Ditto operators following each other. (e.g. `&&&` is tokenised to `&&`
// and `&` - callers job to spot it).
//
// 2024_11_14: Q: Should it be `\b\d>{1,3}` - i.e. use word boundary
// not hacked together nonsense?  
RE_OPERATOR = /&&?|\|\|?|>>?|<<?|;|(?<=^|\s)\d>{1,2}/y,    
RE_EXPR_START = /\$\{/y,
RE_EXPR_BODY = /.*?(?=\s|\})/y; //< FIXME: we should really switch parser to bind so spaces, etc.. fall.

export const
INFO_NONE = "",
INFO_HASVALUE = "=",
INFO_QUOTED = "\"";

const NOT_QUOTED = false,
QUOTED_STRING = true,
QUOTED_EXPR = "expr"; 
 
export const FILE_TOPIC = Symbol( "-" ); //< The '-' on the command line (or, as an argument). NB the description must be the text.

function 
testRegex( expr, text ) {
    expr.lastIndex = 0;
    return expr.test( text ) && expr.lastIndex === text.length;
}

const ALLOW_GOTCHAS = false;
function 
topify( value, quoted = NOT_QUOTED, processingNamedOptions = true ) {
    return value !== FILE_TOPIC.description || 
           !processingNamedOptions ||
           // At this point, it's definitely a dash. 
           ( ALLOW_GOTCHAS && quoted === NOT_QUOTED ) ? value : FILE_TOPIC;
}

function
processExprValue( named, value, quoted, processingNamedOptions, fromArgv = false ) {
    if ( quoted === QUOTED_EXPR ) {
        return { type: named ? ARG_NAMED_EXPR : ARG_POSITIONAL_EXPR, value, info: INFO_NONE };
    } else {
        return { type: named ? ARG_NAMED_VALUE : ARG_POSITIONAL_VALUE, value: topify( value, quoted, processingNamedOptions ), info: quoted === QUOTED_STRING ? INFO_QUOTED : INFO_NONE };
    }
}

/// @brief Is this element quoted in a way that enables us to strip the quotes?
///
/// Q: Should we swear (or worn) if we find quotes in the middle? e.g. `'"hello" "world"'`?
/// A: No. Because that could have been a single arg that is destined to be reparsed.  
function
ArgvElement_hasStrippableQuotes( value ) {
    if ( !value.startsWith( '"' ) && !value.startsWith( "'"  ) )
        return;
    return value.indexOf( value.charAt( 0 ), 1 ) === value.length - 1;
}

/// @brief This looks at an argument to determines whether it would
/// throw an error if it wasn't quoted.
/// 
/// So if it the value can be parsed as an operator _OR_ it doesn't contain any
/// spaces or specials, then you will be told not to quote (i.e. return `true`)
/// otherwise you'll be told to quote.  
/// 
/// @note It doesn't consider options (words beginning with '-') and we rely
/// on it not considering them elsewhere. 
function
ArgvElement_isSafeBarewordOrOperator( value ) {
    if ( /\s/.test( value ) )
        return false;
    RE_OPERATOR.lastIndex = 0;
    const operator = RE_OPERATOR.exec( value );
    if ( operator ) {
        // Leave operator unquoted; assume other specials need quoting.
        return operator[0].length === value.length;
    }
    // Assume specials need quotign, and anything else can be left unquoed. 
    return !RE_SPECIAL.test( value );
}
  

function
processExprArgv( named, value, quoted, processingNamedOptions ) {
    if ( quoted !== NOT_QUOTED ) 
        throw new Error( "fromArgv options must always be unquoted" );
    
    if ( ArgvElement_hasStrippableQuotes( value ) ) {
        value = value.slice( 1, -1 );
        quoted = QUOTED_STRING;
    }
    // Q: Should we check the syntax here, rather than in LexicalEnvironment (which calls
    // `Binding.from()` and we could do that).
    else if ( value.startsWith( '${' ) && value.endsWith( '}' ) ) {
        /// 2024_10_2: Q Should we allow positional expressions after escaping with `--`?
        /// Should any of these be allowed after escaping with `--`?
        ///
        /// A: 1) we should mirror the string parser.
        ///    2) it depends on how we view `--` Fundamenetally, it's escape of further
        ///    options (and the topic?) and we should limit it to that.  
        if ( processingNamedOptions  ) {
            value = value.slice( 2, -1 );
            quoted = QUOTED_EXPR;
        }
    } else if ( value.startsWith( '`' ) && value.endsWith( '`'  ) ) {
        // 2024_12_1: 
        // 1. Doing this here means is **necessary(( to spot literal values rather than expressions 
        // as the latter cause problems for lists.
        //
        // 2. It means we match the string parser with early errors.
        const instr = new Instr( value.slice( 1 ) ); 
        const binding = Binding.fromTemplateTail( instr );
        // Should we 
        if ( !instr.atEof() ) {
            // This is not a partciularly helpful error message. 
            throw instr.error( "expected argument end" );
        }
        if ( binding.isLiteral() ) {
            value = binding.toLiteralValue();
            quoted = QUOTED_STRING;
        } else {
            quoted = QUOTED_EXPR;
        }
        // Q: Should we handle reduplicated quoting here, as we are handling `\``?
        // A: It would mean `"--x"` is NOT seen an option, `"-"` would NOT be seen as the file topic, 
        // and `"--"` wouldn't be seen as the escape. The idea to make it a generic feature of argtok
        // is nice. But this is the wrong place because it interferes with the processing. 
    }
    return processExprValue( named, value, quoted, processingNamedOptions );
}
 



// Q: should this just tokenise and pass to the below?
// A: We do 90% of the work.
//
// Q: Should we switch to just tokenising? That would means `--option="string value"` is broken into tokens [`--option`,`=`,`"string value"`] 
// (i.e. we tell it, it's quoted.) It also means we need to include whitespace as tokens - because presumaby `--option = value` is not what we 
// want and we know `--option=value"hello world"" is not what we want either.
//
// FIXME: we don't currently allow `-C${dir}` which is reasonable; it should be the last option and becomes
// it's value.    
export function 
*parseText( text ) {
    let processingNamedOptions = true;  //< Can text begining with '-' be an option, or should it be 
                                        // treated as a positional; i.e. have we encountered `--` 
                                        // in the input stream.
    const instr = new Instr( text, { autoTrim: false, trimStart: false } );
    for ( let firstToken = true;;) {
        const trimmed = instr.trimStart();
        if ( instr.atEof() )
            break;
        const operator = instr.match( RE_OPERATOR ); 
        if ( operator ) {
            yield { type: ARG_OPERATOR, value: operator, info: INFO_NONE };
            processingNamedOptions = true;
            firstToken = true;
            continue;
        }
        if ( !trimmed && !firstToken ) {
            // As a rule, options and positionslas MUST be separated by whitespace.  
            throw instr.error( "expected whitespace" );
        }
        firstToken = false
        let type, value, quoted = NOT_QUOTED;
        // One of the consequences of this, is `"--thing"` is not seen as an option.
        if ( processingNamedOptions && (( value = instr.match( RE_OPTION ) ))  ) {
            if ( value === "--" ) {
                processingNamedOptions = false;
                continue;
            }
            if ( value === FILE_TOPIC.description ) {
                yield { 
                    type: type === ARG_NAMED_VALUE ? ARG_NAMED_VALUE : ARG_POSITIONAL_VALUE, 
                    value: FILE_TOPIC, 
                    info: INFO_NONE 
                };
                continue;
            } else {
                const hasValue = instr.match( "=" );
                // 2023_9_12: NB `---x` is legal. As is `---`. Both just return unknown option errors.
                yield { type: ARG_NAME, value, info: hasValue ? INFO_HASVALUE : INFO_NONE };
                if ( !hasValue )
                    continue;
                type = ARG_NAMED_VALUE;
            }
        } else {
            type = ARG_POSITIONAL_VALUE;
        }            
        // This is all the same as env: merge it.
        if ( instr.match( RE_EXPR_START ) ) {
            instr.trimStart();
            const start = instr.pos;
            Binding.fromEmbeddedExpr( instr );
            value = instr.slice( start ).trimEnd();
            if ( !instr.match( "}" ) )
                throw instr.error( "expected '}'" );
            quoted = QUOTED_EXPR; // This is irrelevent to `processExprValue()` below.
        // Should we move more of this into the parseOptions? We could include a WS token and it could?
        // swear there.
        } else if ( instr.match( '`'  ) ) {
            // FIXME: This should be `Binding.fromSimpleLiteral()` or something.
            const start = instr.pos - 1;
            const binding = Binding.fromTemplateTail( instr );
            if ( binding.isLiteral() ) {
                value = binding.toLiteralValue();
                quoted = QUOTED_STRING;
            } else {
                // 2024_11_19: As things stand, we have to get the whole text, as is, and let 
                // it be reparsed at a later stage (cf. above). We could cache the result in a 
                // map somewhere. But.
                value = instr.slice( start );
                quoted = QUOTED_EXPR;
            }
        } else {
            // FIXME: should this be capable of spotting errors?
            ({value,quoted} = _readQuotedValueOrBareword( instr ));
            if ( quoted  ) {
                // For compatibility with `parseArray()`. Without it, a script
                // in package.json which uses doubled quotes can be run from npm
                // but not js-hell. There is still a compatibility issue with
                // single arg.     
                if ( ArgvElement_hasStrippableQuotes( value ) ) {
                    value = value.slice( 1, -1 );
                }
            } else if ( value === ''  ) {
                /// This covers cases:
                // CASE: `[--value=]<ILLEGAL>` 
                // CASE: `[--value=]<operator>`
                if ( !instr.startsWith( /\s/y ) ) {
                    throw instr.error( "Illegal character - must be quoted" );
                
                // CASE: `--value= something`. Likely an error. And we're being stricter; so not
                // a gotcha.
                } else if ( type === ARG_POSITIONAL_VALUE ) {
                    throw instr.error( "Expected argument to option" );
                }
            }
        }
        yield processExprValue( type === ARG_NAMED_VALUE, value, quoted, processingNamedOptions );
    }
}

function
splitOption( value ) {
    const equals = value.indexOf( '=' );
    if ( equals === -1 ) {
        return [value];
    } else {
        return [ value.slice( 0, equals ), value.slice( equals + 1 ) ]
    }
}


// 2024_11_15: when parsing a string:
//  - currently, operators aren't seen as operators when quoted; e.g. `x "&&" y` is different 
//    to `x && y`;
//  - IIRC we did away with the difference between `"-"` and `-` for the file topic;
//  - but there is currently also a difference between `"-x"` and `-x` (See below.) with the
//    former not being seen as an option.
//
// HOWEVER the quoting is hidden from is (unless double quoted) when parsing an argv array
// so this is hidden from us and makes us inconsistent. 
//
// On being able to quote options: if we were building a ground up text parser we would
// want `"--x"` not to be seen as option. "--" exists precisely to solve this.
//
// Given the situation we operate in, it may not be realistic to treat quoted and unquoted
// strings differently. But we also need a way to quote operators. (e.g, would it make sense 
// for `--&&` to be seen as NOT being the operator but a literal `&&` and then remove the 
// dependency on quoting? Except this doesn't handle `"x&&y"` 
//
// Should we haves `--` block the intepretation of any specials? But in which case, we need a 
// way to turn it off that is compatible. A normal shell will spot && and end it.)
//
// The current `'` solution may be close. But rather than rejoining, should we treat the 
// remaining arguments as a series of positionals, irrespective; e.g. 
// `npm start node js-hell.mjs js-hell ' some thing in here '`;
// on posix, it will get a js-hell and a single arg, which it reparsed. On windows it gets
// the quoted args. It's a bit more verbose than what we're proposing, but less hazzardous. 
//

 
/// @brief Look at an argument and take an educated guess about whether it was
/// originally quoted or not, and then requote it or leave as is. 
function
requoteArg( arg ) {
    // 2024_11_15:  There is currently no escaping mechanism that works. Backticks
    // and literals in expressions `${'"'}` should, eventually, happen - although
    // not in every case. 
    if ( arg.includes( `"` ) || arg.includes( `'` ) )
        throw new Error( "Cannot quote string" );
    // See above disucssion about quoting.
    if ( !arg.startsWith( "-" ) )
        return isSafeBarewordOrValidOperator( arg ) ? arg : `"${arg}"`;
    // Single dash is even more of a nightmare. Do we even allow -C"dir"?
    // And how can we separate it from -Cd"ir"?
    if ( !arg.startsWith( "--" ) ) {
        if ( !isSafeBarewordOrValidOperator( arg ) ) 
            throw new Error( "Cannot quote single-dash options" );
        return arg;
    }
    const [optionName,optionValue] = splitOption( arg );
    // Should we quote the whole argument "as is" in this case?
    if ( !isSafeBarewordOrValidOperator( optionName ) ) {
        throw new Error( "Cannot quote string" );
    }
    if ( typeof optionValue === 'undefined' )
        return arg;
    return isSafeBarewordOrValidOperator( optionValue ) ? arg : `${optionName}="${optionValue}"`;
}


// Q: should this be replaced with `parseText( args.join( ' ' ) )`? Doubled quoting is now a 
// thing and it would be a very simple rule to reason about.
// A: No because of a) laziness, b) principle of least surpise, and c) consistency. 
// Typing `js-hell rm "some file"` from the console would delete the files `some` and `from`. 
// This is surprising and would require more effort to type `js-hell rm '"some from"'`. 
// Also, at the time of writing (2024_11_25) the text parser would quite happily do what was 
// intended. 
//
// This is here to stay, in some form. It's about finding the edge cases and making the least
// worst and most useful options. 
//
// FIXME: we don't currently allow `-C${dir}` which is reasonable; it should be the last 
// option and becomes it's value.     
export function 
*parseArray( args ) {
    let processingNamedOptions = true;
    for ( const value of args ) {
        if ( !processingNamedOptions || !value.startsWith( "-" ) ) {
            // The easy case, the arg exactly matched an operator. 
            if ( testRegex( RE_OPERATOR, value ) ) {
                yield { type: ARG_OPERATOR, value, info: INFO_NONE };
            } else {
                // Q: Consider `["cmd1", "x&&cmd2"]` Should we assume it was quoted? Or should we
                // split? A more pertinent case is `["cmd1", ">file"]` Is it not reasonable to assume
                // that operator should be split?
                yield processExprArgv( false, value, false, processingNamedOptions );
            }
        // Historically "--" stops option processing (e.g. so you can delete the file called
        // `-R` with `rm -- -R` or pass args to other commands). We preserve that. This is, however,
        // uncessary as quoting prevents `-"` being seen as syntax (so `rm "-R"` deletes
        // the file `-R`). Admittedly, however, `js-hell rm '"-R"'` is more verbose than 
        // `js-hell rm -- -R`.
        //
        // Q: Should this switch to this interprets *everything* as a a postional - perhaps ignoring
        // even reduplicated quoting? Again, a simple rule. Possibly even pass them as a specialised
        // command tail?  
        } else if ( value === "--" ) {
            processingNamedOptions = false;
        // Historically, "-" is a positional paramter normally meaning stdin. 
        // If it occurs after `--` then it is just an ordianry positional. Quoting of this
        // has gone back and forth, partly driven by the historic lack of redup quoting.
        } else if (  value === FILE_TOPIC.description ) {
            yield { type: ARG_POSITIONAL_VALUE, value: FILE_TOPIC, info: INFO_NONE };
        } else {
            // The string parser stops at the specials; we don't. But hopefully validation of names is done
            // elsewhere.
             if ( !value.startsWith( "--" ) ) {
                // `-x` This means `-C${dir}` or `-C'"some dir"'` doesn't work - see rule above.
                // FIXME: search for one of the quotes `/[`"']|\$[{(]/` If that occurs. Reparse them
                // as -x -y -z and so on, and then the value; i.e. we do the splitting. Although, would that
                // be confusing? Should we parse it as a positional value and leave the parser?
                //
                // Q: Should we have ARG_SHORT_NAME and stirp the dash? 
                // Q: Should we split as described above?
                // A: No because we don't know where the divider is.
                yield { type: ARG_NAME, value, info: INFO_NONE };
            } else {
                const [optionName,optionValue] = splitOption( value );
                if ( typeof optionValue === 'undefined' ) {
                    yield { type: ARG_NAME, value: optionName, info: INFO_NONE };
                } else {
                    // Q: Consider `["cmd1", "--option=&&cmd2"]` How should we interpet that?
                    // Should we suppose what was meant (and perhaps typed) was a) `cmd1 --option=""&&cmd2` 
                    // or b) `cmd1 --option="&&cmd2"`? (The third effective optin is `cmd "--option=&&cmd2"`
                    // but, if you wanted that, you needed to redup the quotes.) 
                    yield { type: ARG_NAME, value: optionName, info: INFO_HASVALUE };
                    yield processExprArgv( true, optionValue, false, processingNamedOptions );
                }
            }
        }
    }
}


export default function
argtok( source, startIndexIfArray = 0 )  {
    // Q: Should we exlude iterables? This can handle it.
    if ( typeof source === 'string' ) 
        return parseText( source );
    else if ( !Array.isArray( source ) )
        throw new TypeError( "Invalid argument (argument must be an array or a string)" ); 
    let iterator = source[Symbol.iterator]();
    // Q: should we move single arg retokenisation to here? i.e. make it a feature of the parser
    // and not the higher ups?
    // There's generally only one or two, so reasonably efficient.
    if ( startIndexIfArray ) {
        if ( typeof iterator.drop === 'function' ) {
            iterator = iterator.drop( startIndexIfArray );
        } else {
            while ( startIndexIfArray ) {
                iterator.next( );
            }
        }
    }
    return parseArray( iterator );
}

// ---------------------------------------
// 2024_11_23:  I don't know why any of the below exists! It's yet another thing to get out of sync! 

/// Broken out because `expect(_shfy(parseArray(array))).toEqual( array )`
function     
_shfy( ast ) {
    const result = [];
    let lastName, endedOptions = false; 
    for ( const {type,value} of ast ) {
        if ( typeof lastName !== 'undefined' ) {
            if ( type === ARG_NAMED_VALUE ) {
                result.push( `${lastName}=${value}` );
                lastName = undefined;
                continue;
            } else {
                result.push( lastName );
                lastName = undefined;
            }
        }
        if( type === ARG_POSITIONAL_VALUE ) {
            if ( value === FILE_TOPIC ) {
                result.push( FILE_TOPIC.description );
            } else {
                if ( !endedOptions && value.startsWith( "-" )  ) {
                    result.push( "--" );
                    endedOptions = true;
                } 
                result.push( value );
            }
        } else if ( type === ARG_NAME ) {
            if ( endedOptions )
                throw new Error( "Probably can't represent args as an array" );
            lastName = value;
        } else if ( type === ARG_OPERATOR ) {
            // FIXME: we should restart options. Chjeck for other errors.
            endedOptions = false;
            if ( typeof lastName !== 'undefined' ) {
                result.push( lastName );
            }
            lastName = undefined;
            result.push( value );
        } 
        else throw new TypeError( "Unexpected arg type" );
    }
    if ( typeof lastName !== 'undefined' ) {
        result.push( lastName );
    }
    return result;
}

/// @brief Break a string into a series of tokens that roughly resemble
/// what a shell might parse us.
// 2022_10_6: Should this be called `shtok`. Thats what it is, I think... (I'm an idiot.)
export function 
shfy( source ) {
    if ( typeof source !== 'string' )
        throw new TypeError( "Source must be a string" );
    return _shfy( parseText( source ) );
}
     

