import parseUsage from "./parse.mjs";
import {NODETYPE_NAMED,NODETYPE_POSITIONAL,NODETYPE_LITERAL,NODETYPE_LIST,TYPE_TRUE,TYPE_FALSE,createNamed as AST_createNamed} from "./ast.mjs"; 
import Instr from "../Instr.mjs";
import PositionalTree from "./PositionalTree.mjs";
import NamedOption,{PLATFORM_HOST,PLATFORM_INLINE}  from "./NamedOption.mjs";
import {DEFAULT_MISSING_BOOL} from "../consts.mjs";
import MultiMap from "../utils/MultiMap.mjs";
import json_q from "../utils/json_q.mjs";
import {toKebabCase as CamelCase_toKebabCase} from "../utils/CamelCase.mjs";
const DEBUG = true;
export {PLATFORM_HOST,PLATFORM_INLINE};
import CliOption from "./CliOption.mjs";
import Usage,{SOURCE_DEFAULT} from "./Usage.mjs";
export {SOURCE_DEFAULT};

///
/// Misnamed. This is not really validation.
function 
splitAstIntoOptionsAndPositionalTree( [mandatoryOptions,optionalOptions,positionals] ) {
    // Do we want to do this, this early? PositionalTree.fromAst() at a later point wuld be good.
    const positionalTree = new PositionalTree( positionals );
    if ( !positionalTree )
        throw new TypeError( "Postional arguments are ambiguous." );

    return {
        mandatoryOptions,
        optionalOptions,
        positionalTree 
    } 
}

function 
doesInlineOptionMatchUsage( inlineOption, usageOption ) {
    const {name:key}=inlineOption;
    
    // This means `@option x` is fine.
    if ( !inlineOption.hasDefaultValue && !inlineOption.hasExplicitType )
        return true;
    // But add a type or default, and you're in trouble;
    // there's no reason this should be blocked - I just haven't had time to code
    // yet another type check.
    throw new Error( "Cannot declare an option in both usage and binding" );
}

function
getOptions( optionsText, name ) {
    const {mandatoryOptions,positionalTree,optionalOptions} = splitAstIntoOptionsAndPositionalTree( parseUsage( new Instr( optionsText ), "" ) );
    if ( mandatoryOptions.length !== 0 || positionalTree.longest !== 0 )
        throw new TypeError( "Invalid platform usage" );
    for ( const o of optionalOptions ) 
        o.platform = name;
    return optionalOptions; 
}

function 
processPlatformOptions( platformOptionsTextOrDictionary ) {
    if ( !platformOptionsTextOrDictionary )
        return [];
    if ( typeof platformOptionsTextOrDictionary !== 'object' )
        return getOptions( `${platformOptionsTextOrDictionary}`, "platform" );
    
    const result = [];
    for ( const [name,optionsText] of Object.entries( platformOptionsTextOrDictionary ) ) {
        result.push( ...getOptions( optionsText, name ) );
    }
    return result;
}
function 
getDefault( node, recurs, defaultStringsMap, defaultValuesMap ) {
    // FIXME: This is not stuff we should be doing. It's other people's job to reconcile two 
    // different defaults.
    const {key}=node;
    const defaultValue = defaultValuesMap.get( key );
    const hasDefaultValue = defaultValuesMap.has( key ); 
    
    if ( recurs && hasDefaultValue ) {
        // 1. It will be passed an array, not a literal.
        // 2. It could be an empty list, but it will always get a list.
        console.warn( json_q`warning: list option ${key} has a default value` );
    }
    if ( defaultStringsMap.has( key ) ) {
        if ( hasDefaultValue ) {
            console.warn( json_q`warning: default for option ${key} will be ignored` );
        }
        return { 
            defaultText: defaultStringsMap.get( key ),
            defaultValue,
        };
    } else if ( !recurs && ( node.value === 'true' || node.value === 'false' ) ) {
        if ( hasDefaultValue ) {
            if ( node.value === 'true' ) {
                if ( defaultValue !== false ) {
                    console.trace( `warning: true option ${key} doesn't default to false` );
                } else {
                    // 2024_6_22: A lot of old code does this and I don't think it's harmful.
                    // It's almost to be encouraged.
                    false && console.trace( `warning: true option ${key} will alway default to false` );
                }
            } else {
                if ( defaultValue !== true ) {
                    console.warn( `warning: false option ${key} doesn't default to true` );
                } else {
                    // 2024_6_22: A lot of old code does this and I don't think it's harmful.
                    // It's almost to be encouraged.
                    false && console.trace( `warning: false option ${key} will alway default to true` );
                }
            }
            return {
                defaultText: DEFAULT_MISSING_BOOL,
                defaultValue,
            };
        } else {
            return {
                // DEFAULT_MISSING_BOOL should be replaced with a flag which tells us to initialise
                // the global environment with the default value. (Q: Should all defaults be done
                // like that?)
                defaultText: DEFAULT_MISSING_BOOL,
                defaultValue: node.value === 'true' ? false : true
            }
        }
    } else {
        return {
            defaultText: undefined,
            defaultValue,
        }
    }
}
 
function 
mungeOptions( 
    usageStringOrInstrOrAST,   
    defaultStrings = {}, 
    defaultValuesEntries = [],
    inlineOptions 
) { 
    const userUsage = splitAstIntoOptionsAndPositionalTree( usageStringOrInstrOrAST ),
          {mandatoryOptions,positionalTree,optionalOptions}=userUsage;
     
    for ( const o of optionalOptions )
         o.platform = "";
    
    const allOptions = [];
    for ( const node of mandatoryOptions ) {
        // Why can we not uses Named and node/listNode
        allOptions.push( NamedOption.fromMandatoryAstNode( node) ); 
    }
    const defaultStringsMap = new Map( Object.entries( defaultStrings ) ),
          defaultValuesMap = new Map( defaultValuesEntries );  
    for ( const node of optionalOptions ) {
        const recurs = node.type === NODETYPE_LIST, 
              listElementNode = recurs ? node.value : node;
        // FIXME: have getDefault work on NamedOption which solves the above.
        const {defaultText,defaultValue} = getDefault( listElementNode, recurs, defaultStringsMap, defaultValuesMap );
        allOptions.push( NamedOption.fromNonMandatoryAstNode( node, defaultText, defaultValue ) );
    }
    // These should probably be seen by the above.
    for ( const inlineOption of inlineOptions ) {
        allOptions.push( NamedOption.fromInlineOption( inlineOption ) );
    }
    return { allOptions, positionalTree }; 
}
  

/// @brief Merge the user supplied and platform usage strings, and produce a 
/// list of positional parameters and a map of named parameters.
///
/// @param `platformOptionsTextOrDictionaryOrCallback` Global options provided by the host that the user can set;
/// e.g. `[--output=FILE] [--output-format=STR]`
/// 
/// @Q: What is the usecase for this as a function? In fact, why so many diverse formats?  
///                                                   
export default function 
build( ast,   
    defaultStrings = {}, 
    defaultValuesEntries = [],
    inlineOptions = [],
 ) {
    const { allOptions, positionalTree } = mungeOptions( ast, defaultStrings, defaultValuesEntries, inlineOptions );
    
    const keysFromOptionNames = new Map, 
          optionsByKey = new MultiMap;
          
    for ( const optionDescriptor of allOptions ) {
        const {key,optionNames} = optionDescriptor;
        optionsByKey.append( key, optionDescriptor );
        for ( const optionName of optionNames ) {
            if ( keysFromOptionNames.has( optionName ) ) {
                if  ( keysFromOptionNames.get( optionName ) !== key ) {
                    throw new Error( json_q`Duplicate option ${optionName}` );
                }
            } else {
                keysFromOptionNames.set( optionName, key );
            }
        }
        
    }
    const saneOptionsFromKey = new Map;
    // 2024_6_22: The ongoing hack that handles booleans:
    // Also merge inline (`@option`) options and usage equivalents.
    for ( const key of optionsByKey.keys() ) {
        const fixups = optionsByKey.getAll( key );
        
        if ( fixups.length == 1 && !"skip sanity checs for inline options" ) {
            continue;
        }
        
        // I suspect this ends up being group by platform. Can we allow overriding of
        // builtin options? (cf. `--input`) Or, at least, redeclaration?
        const {inline=[],usage=[]} = Object.groupBy( fixups, option => option.isInline() ? 'inline' : 'usage' );
        
        if ( usage.length > 1 ) {
            // The only allowed cases are `--xxx` and `--no-xxx`: this should pick that up.
            if ( usage.length !== 2 || usage[0].optionName === usage[1].optionName ) {
                // We probably need to get the option name.
                throw new TypeError( `Duplicate options for key ${key}` );
            }   
            if ( usage.some( option => option.defaultText !== DEFAULT_MISSING_BOOL ) ) {
                // We probably need to get the option name.   
                throw new TypeError( `Duplicate options for key ${key}` );
            }
            // FIXME: we really only want one option record here. But we can't yet handle that
            // in createLexicalEnvironment, etc...
            for ( const option of usage ) {
                option.defaultText = undefined;
            }
            const unifiedBool = NamedOption.sanitiseBoolean( usage );
            saneOptionsFromKey.set( unifiedBool.key, unifiedBool );
            
        } else if ( usage.length === 1 ) {
            saneOptionsFromKey.set( usage[0].key, usage[0].isInsaneBoolean() ? NamedOption.sanitiseBoolean( usage ) : usage[0] );
        }
        if ( inline.length >= 1 ) {
            if ( inline.length !== 1 ) 
                throw new Error( `Internal error (inline options for key ${key} not deduplicated)` );
            if ( usage.length === 0 && inline[0].typename === '' ) {
                throw new Error( json_q`Inline-option ${inline[0].optionName} has no type. (Add a type or shadow the option in the usage )` );
            }
            // If it's more than one, e.g. a bool as above, what should we do?
            // (NB it currently doesn't actually check. )
            if ( !doesInlineOptionMatchUsage( inline[0], usage[0] ) ) {
                throw new Error( "Cannot declare an option in both usage and binding" );
            }
            if ( usage.length === 0 ) {
                saneOptionsFromKey.set( inline[0].key, inline[0].isInsaneBoolean() ? NamedOption.sanitiseBoolean( inline ) : inline[0] );
            }
        } 
    }
    // 2024_7_17:  Historic format, the above, I think is preferabble.
    const cliMap = new Map;
    for ( const [optionName,key] of keysFromOptionNames ) {
        // 2024_7_17: Of course, one of the reasons it exists is because booleans have
        // two records; one for the positive and one for the negative. This design
        // at least makes us neutral on what is negative.
        // (Is it possible multiple types might be handled this way? )
        const all = optionsByKey.getAll( key );
        if ( all.length === 1 ) {
            cliMap.set( optionName, CliOption.fromOption( all[0] ) );
        } else if ( all[0].optionNames.includes( optionName ) ) {
            cliMap.set( optionName, CliOption.fromOption( all[0] ) );
        } else if ( all[1].optionNames.includes( optionName ) ) {
            cliMap.set( optionName, CliOption.fromOption( all[1] ) );
        } else {
            console.log( all );
            throw new Error( json_q`Internal error (can't find option record for key ${key} with option name ${optionName})` );
        }
    }
     
    return new Usage( {
        positionalAstNodes:ast[2],
        positionalTree,
        saneOptionsFromKey,                           //< Map<string:key,NamedOption>  
        cliMap                                        //< Map<string:optionName,CliOption> 
    } );
}

export function
buildFromStringWithoutPositionals( optionsString, platform = "", defaultStrings, defaultValuesEntries ) {
    // Just try getOptions? Except the below defaults and sanitises and stuff.
    const result = build( parseUsage( new Instr( optionsString ), "" ), defaultStrings, defaultValuesEntries );
    if ( result.hasPositionalOptions() ) {
        console.log( result.positionalOptions );
        throw new TypeError( "Cannot add positional options" );
    }
    if ( platform !== "" ) {
        for ( const namedOption of result.saneOptionsFromKey.values() ) {
            console.assert( namedOption.platform === "", "platforms shouldn't be defined (was %s)", namedOption.platform );
            namedOption.platform = platform;
        }
    }
    return result;
}

export function
addOptions( {saneOptionsFromKey,cliMap}, optionsString, platform = "", defaultStrings, defaultValuesEntries ) {
    // Just try getOptions? Except the below defaults and sanitises and stuff.
    const result = buildFromStringWithoutPositionals( optionsString, platform, defaultStrings, defaultValuesEntries );
    for ( const [optionName,record] of result.cliMap ) {
        if ( cliMap.has( optionName ) ) 
            throw new TypeError( json_q`key ${optionName} already defined` );
        cliMap.set( optionName, record );
    }
    for ( const [key,record] of result.saneOptionsFromKey ) {
        if ( saneOptionsFromKey.has( key ) ) 
            throw new TypeError( json_q`key ${key} already defined` );
        saneOptionsFromKey.set( key, record );
        record.platform = platform;
    }  
}

 
