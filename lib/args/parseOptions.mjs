import {
  ARG_POSITIONAL_VALUE, ARG_NAMED_VALUE, ARG_NAME,
  ARG_NAMED_EXPR, ARG_POSITIONAL_EXPR, ARG_OPERATOR, 
  INFO_HASVALUE, INFO_NONE, INFO_QUOTED,
  FILE_TOPIC, 
} from "./argtok.mjs";
import {ARGVALUE_NONE} from "../usage/CliOption.mjs";

export const HELP = Symbol( "help" );
export {FILE_TOPIC};
// These Could be as symbols.
export const 
KEY_POSITIONAL = '',
KEY_TAIL = '...';
  
const STATE_EXPECTING_OPTION = 'option',
      STATE_START = 'start',
      STATE_EXPECTING_NAMED_VALUE = 'value';

export const
INSTANTIATE_VIA_LOOKUP = Symbol( "lookup" ); 

export const
SOURCE_CLI = 'cli';

/// @brief Handle all the `-zyx`, `-vvvC20` stuff.
function 
toOptionName( value )
    {
        if ( value[0] === '-' && value[1] !== '-' ) {
            return {
                optionName: value.slice( 0, 2 ),
                optionNameTail: value.slice( 2 ),
            };
        }
        return {
            optionName:value,
            optionNameTail:''};
    }

/// @brief Protect an iterator from calling `iterator.return`
/// Hopefully one of the iterator builtins does this.
function 
*Iterator_clone( iterable ) {
    const iterator = iterable[Symbol.iterator]();
    for ( ;; ) {
        const {done,value} = iterator.next();
        if ( done )
            return value;
        yield value;
    }
}

// Q: Should we be using `Usage` and not the `cliOptionMap`?
export default function 
*parseOptions( cliOptionMap, args, tailStartIndex = 0 ) {
    let lastOptionName ='';
    let state = STATE_EXPECTING_OPTION;
    let positionalCount = 0;
    let callArgsReturn = true;
    const iterator = args[Symbol.iterator]();
    try {
        for ( const {type:argType,value:argValue,info:argInfo} of Iterator_clone( iterator ) ) {
            if ( state === STATE_EXPECTING_OPTION ) {
                // 2024_10_14: `Usage` sets up the cliOptionMap such that supported redirecting operators are mapped onto the relevant
                // options; i.e. there is an entry in in `cliOptionMap` for `>`, etc..
                //
                // FIXME: operators should be last. i.e. there should be nothing but operators and operator values after an operator.
                // 
                if ( argType === ARG_NAME || argType === ARG_OPERATOR ) { 
                    // Ideally, argstr would handle this this option name madness. But we 
                    // don't know about short options unless we tell it.
                    PROCESSING_OPTION: for ( let {optionName, optionNameTail} = toOptionName( argValue );; ) {
                        // Q: Should we be spotting missing options?
                        // A: If it was mandated that all options uses '=' to pass there value, then it would be fine;
                        // the trouble is we don't know whether positional(s?) after an option are it's values or
                        // separate positions until we have looked up the option.
                        if ( !cliOptionMap.has( optionName ) ) {
                            throw new TypeError( `Unknown option ${JSON.stringify( optionName )}` );
                        }
                        const {key,arg:valueType,impliedValue} = cliOptionMap.get( optionName );
                              
                        if ( valueType === ARGVALUE_NONE ) {
                            yield { key, value:impliedValue, isInstantiated: true, optionName, source: SOURCE_CLI };
                            // Support for classic `-tgzfsomefilename.tgz` The CLI is a compact DSL
                            // and benefits from this.
                            if ( optionNameTail ) {
                                optionName = '-' + optionNameTail[0];
                                optionNameTail = optionNameTail.slice( 1 )
                                continue PROCESSING_OPTION;
                            } 
                        } else if ( optionNameTail ) {
                            yield { key, value: optionNameTail !== FILE_TOPIC.description ? optionNameTail : FILE_TOPIC, isInstantiated: false, optionName, source: SOURCE_CLI }
                        } else {
                            state = STATE_EXPECTING_NAMED_VALUE;
                        }
                        // See below: this is diagnostic for failures.
                        lastOptionName = optionName;
                        break PROCESSING_OPTION;
                    } 
                } else if ( argType === ARG_NAMED_VALUE || argType === ARG_NAMED_EXPR ) {
                    throw new TypeError( `Cannot set a value for ${lastOptionName}` );
                } else {
                    
                    if ( argType === ARG_POSITIONAL_VALUE ) {
                        yield { key: KEY_POSITIONAL, value: argValue, isInstantiated: false, optionName: '', source: SOURCE_CLI };
                    } else if ( argType === ARG_POSITIONAL_EXPR ) {
                        yield { key: KEY_POSITIONAL, value: argValue, isInstantiated: INSTANTIATE_VIA_LOOKUP, optionName: '', source: SOURCE_CLI };
                    } else { 
                        throw new TypeError( "Unsupported argType" );
                    }
                    // This means tailStartIndex must be at 1. So you can't write `cmd ...ARGS` it has to be
                    // `cmd THING ...ARGS` If it was zero, there would be no point calling us at all!
                    ++positionalCount;
                    if ( positionalCount === tailStartIndex ) {
                        yield { key: KEY_POSITIONAL, value: iterator, isInstantiated: true, optionName: '...', source: SOURCE_CLI };
                        callArgsReturn = false;
                        return;
                    }
                }
            
            } else {
                // This enables commands that take optional values -- e.g. `--x[=value]` 
                const optionName = lastOptionName;
                const {key,arg:valueType} = cliOptionMap.get( optionName );
                if ( valueType == ARGVALUE_NONE ) 
                    throw new Error( "Internal error - should be unreachable (in STATE_EXPECTING_NAMED_VALUE state for ARGVALUE_NONE arg )" ); 
                
                if ( argType !== ARG_NAMED_VALUE && argType !== ARG_POSITIONAL_VALUE && argType !== ARG_NAMED_EXPR && argType !== ARG_POSITIONAL_EXPR  )
                    throw new TypeError( `Need value for ${optionName}` );
                yield { 
                    key,
                    value: argValue, 
                        // FIXME: this is not instantiated, is it. It's an unparsed expr.
                        // So we need this to be type: and then type to be TYPE_STRING, TYPE_VALUE, TYPE_LOOKUP
                        isInstantiated: argType === ARG_NAMED_EXPR || argType === ARG_POSITIONAL_EXPR ? INSTANTIATE_VIA_LOOKUP : false, 
                        optionName, 
                        source: SOURCE_CLI };
                state = STATE_EXPECTING_OPTION;
            }
        }
        if ( state !== STATE_EXPECTING_OPTION ) {
            throw new TypeError( `Need value for ${lastOptionName}` );
        }
    } finally {
        callArgsReturn 
            && args.return?.();
    }
}


