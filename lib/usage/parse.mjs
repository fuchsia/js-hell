import {fromKebabCase as CamelCase_fromKebabCase} from "../utils/CamelCase.mjs";
import {END_USAGE,WILDCARD_NAME,
_readAnnotation
} from "../re.mjs";

import {NODETYPE_ENUM, NODETYPE_LIST, NODETYPE_LITERAL, NODETYPE_NAMED, NODETYPE_POSITIONAL, NODETYPE_POSITIONAL_VARIANT, NODETYPE_POSITIONAL_WITH_SUFFIX, 
createNamed,createPositional,createPositionalWithSuffix,TYPE_TRUE,TYPE_FALSE} from "./ast.mjs";
export {NODETYPE_ENUM, NODETYPE_LIST, NODETYPE_LITERAL, NODETYPE_NAMED, NODETYPE_POSITIONAL, NODETYPE_POSITIONAL_VARIANT, NODETYPE_POSITIONAL_WITH_SUFFIX};
  
/**
    A lexing recursive descent parser with context sensitive tokenisation!
*/  
// 2022_8_17: 
/// The grammar we want is:
/// ```
/// commment::
///               '--' /* through to EOL */
///
/// named-sequence-term::
///               named-elidable
///               named-term
///
/// named-sequence:
///               named-sequence named-sequence-term
///               named-sequence-term               
///
/// named-elidable::
///               '[' named-term ']'
///
/// positional-sequence:
///               positional-sequence positional-term
///               positional-term               
///
/// positional-elidable::
///               outer-elidable
///               list-term
///
///  list-term::
///               '[' type-term ']' '...'
///               type-term '...'
/// 
///  outer-elidable:: 
///              '[' inner-elidable ']'
///              list-term
///
///  inner-elidable::
///              postional-sequence [outer-elidable [positional-sequence]]
///              outer-elidable [positional-sequence]
///
///  positional-term::
///              LITERAL
///              '(' enum-sequence ')'
///              type-term
///
///
///  // enums should be a type; so this should be listable and fall under type-term.
///  enum-sequence::
///              LITERAL
///              enum-sequence '|' LITERAL
///
///  type-term::
///              type
///              '(' variant-sequence ')' 
///
///  variant-sequence::
///              type
///              variant-sequence '|' type
///
///  top-level::
///              literal [named-sequence] [inner-elidable] 
///
/// 
///
/// ```
///

export const 
ERROR_AMBIGUOUS = "only one optional block is allowed at any level as otherwise the sequence would be ambiguous",
ERROR_INITIAL_LITERAL = "the first token must be a literal",
ERROR_BAD_OPTION_NAME = "options names must be groups of lowercase letters, separated by single dashes", 
ERROR_BAD_ALIAS_NAME = "an option can only be aliased as dash following by a letter or number", 
ERROR_INVALID_TYPE = "Invalid type (typenames must be entirely uppercase with at most one underscore)",
ERROR_INVALID_LITERAL = "Invalid literal (literals must be entirely lowercase broken by single underscores or hyphens )",
ERROR_MISSING_WS = "Must be separated by whitespace",
ERROR_ILLEGAL_SUFFIX = "suffixed type not allowed here",
ERROR_ILLEGAL_ANNOTATION = "annotation not allowed here";

// Tokenisation: 
//    Puncturation: `|()[]=` always stand for themselves;
//    identifiers: /[-_A-Za-z0-9]+/
//    whitespace
// Nothing else is valid. We should implement that.
const /// This is the valid syntax, which we check; it's literal enum plus anchors.
      RE_LITERAL_POSITIONAL_VALID = /^[a-z][0-9a-z]*(?:[_-][0-9a-z]+)*$/,
      RE_VALID_TYPENAME = /^[A-Z]+(?:_[A-Z]+)?(?:\d+)?$/,
      // Is there any reason for excluding digits? Or undeescores? i.e. that it can't match RE_LITERAL_POSITIONAL_VALID
      RE_LONG_OPTION_VALID = /^--[a-z]+(?:-[a-z]+)*$/,  
      RE_SHORT_OPTION_VALID = /^-[a-zA-Z0-9]$/,
      RE_BAREWORD = /[-_A-Za-z0-9]+/y;

const RE_NUMERIC_SUFFIX = /\d+$/g;

      /// TYPE_FILE = 'Date';


function
elipsisError( instr, reason )
    {
        throw instr.error( `\`...\` not allowed (${reason})`, instr.lastIndex );
    }

function
elisionError( instr, reason )
    {
        throw instr.error( `unexpected \`[\` (${reason})`, instr.lastIndex );
    }

function
closureError( instr, type, reason )
    {
        throw instr.error( `expected \`${type}\` (${reason})`, instr.fence() );
    }


function
error( instr, reason )
    {
        throw instr.error( reason, instr.lastIndex );
    }

function
TypeName_fromIdentifer( identifier )
    {
        return identifier.charAt( 0 ) + identifier.slice( 1 ).toLowerCase().replace( /_[a-z]/, t => t.charAt( 1 ).toUpperCase() );
    }

// FIXME: we should fold this into getIdentifierType - a more generic parseIdentifier.
// We could handle the ... as well, there.
// 
// Should we mandate numbered suffixes? or subttypes. jh-cp SOURCE_FILE DEST_FILE ; jh-cp FILE... DIR 
function
parseTypenameIdentifer( identifier )
    {
        // Is is worth (a) validating and (b) calculating the subtype here?
        const suffixMatch = identifier.match( RE_NUMERIC_SUFFIX );
        if ( !suffixMatch ) 
            return { typename: TypeName_fromIdentifer( identifier ), suffix: '' };
        const suffixText = suffixMatch[0],
              unsuffixedIdentifier = identifier.slice( 0, identifier.length - suffixText.length ); 
        return { 
            typename: TypeName_fromIdentifer( unsuffixedIdentifier ), 
            suffix: suffixText 
        };
    }

const 
TOKEN_LITERAL = 'literal',
TOKEN_TYPE = 'type',
// We may be pushing he limits of tokenisation here...
TOKEN_TYPE_WITH_SUFFIX = 'type#',
TOKEN_TYPE_LIST = 'type...',
TOKEN_OPTION = 'option',
TOKEN_PUNCTUATOR = 'punctuator',
TOKEN_WS = 'ws',
TOKEN_EOF = 'eof',
_TOKEN_ANNOTATION_INTRODUCER = '(--)'; //< This is never returned, it gets turned into TOKEN_ANNOTATION.
// TOKEN_ANNOTATION = '--';

function 
getIdentifierType( identifier, instr ) {
    if ( /^[A-Z]/.test( identifier ) ) {
        if ( !RE_VALID_TYPENAME.test( identifier ) ) 
            throw instr.error( ERROR_INVALID_TYPE );
        return TOKEN_TYPE;    
    } else if ( identifier.startsWith( "-" ) ) {
        return identifier === "--" ? _TOKEN_ANNOTATION_INTRODUCER 
            // FIXME: should validate
            : TOKEN_OPTION;
    } else {
        if ( !RE_LITERAL_POSITIONAL_VALID.test( identifier) ) 
            throw instr.error( ERROR_INVALID_LITERAL );
        return TOKEN_LITERAL;
    }
}

function
readToken( instr, trimStart = false ) {
    if ( trimStart )
        instr.trimStart();
    const index = instr.fence();
    // 2024_3_15: Barewards include switches beginning with '-'.
    const identifier = instr.match( RE_BAREWORD, false );
    if ( identifier ) {
        const type = getIdentifierType( identifier, instr );
        if ( type === _TOKEN_ANNOTATION_INTRODUCER ) {
            throw instr.error( ERROR_ILLEGAL_ANNOTATION );
        } else if ( type !== TOKEN_TYPE ) { 
            return {
                type,
                value: identifier,
                index,
                suffix: undefined,
                identifier 
            };
        } else {
            const {typename,suffix} = parseTypenameIdentifer( identifier );     
            // NB this breaks instr.lastIndex. And is not stricktly
            // a token. But it simplifies the downstream code, and that's what we're about.
            const list = instr.match( "..." );
            // 2022_8_17: `FILE4...` makes no sense to me; it's not here for that.
            if ( suffix && list ) 
                throw instr.error( ERROR_ILLEGAL_SUFFIX );
            return {
                type: list ? TOKEN_TYPE_LIST : 
                      suffix ? TOKEN_TYPE_WITH_SUFFIX : 
                      TOKEN_TYPE,
                value: typename,
                index,
                suffix,
                identifier 
            };
        }
    }
    // Yes we allow "." and "......." I see no good reason not to catch them here.
    const punctuator = instr.match( /[|\[\]()=]|\.+/y, false );
    if ( punctuator )
        return { type: TOKEN_PUNCTUATOR, value: punctuator, index, suffix: undefined };
    const ws = instr.match( /\s+/y, false ); 
    if ( ws )
        return { type: TOKEN_WS, value: ws }; 
    const eof = instr.atEof() || instr.startsWith( END_USAGE, false )
    // Should we set value to <EOF> or something. Or Symbol.EOF?
    if ( eof ) 
        return { type: TOKEN_EOF, value: undefined, index };
    throw instr.error(  "unexpected character" );
}

function
readEquivalenceClassTail( instr, _prototype = readToken( instr ) )
    {
        if ( _prototype.value ===  ')' )
            throw instr.error( "empty `()`" );
        if ( _prototype.type === TOKEN_PUNCTUATOR )
            throw instr.error( `unexpected token ${JSON.stringify(_prototype.value)}` );
        const prototype = _prototype.type,
              values = [ _prototype.value ];
        const max = prototype === TOKEN_OPTION ? 2 : 0xfff_ffff;
        for ( ;; ) {
            const sep = readToken( instr, true );
            if ( sep.value === ')' ) 
                return { type: prototype, values };
            if ( sep.value !== '|' ) 
                throw instr.error( `unexpected token ${JSON.stringify(sep.value)}` );
            if ( values.length === max )
                throw instr.error( "can only have a short option and a long option" );   
            const {type,value} = readToken( instr, true );
            if ( type !== prototype ) 
                throw instr.error( `all members of an equivalent class must have the same type` );
            values.push( value );
        }
        
    }


function
readOptionValue( instr, option )
    {
        const {type,value} = readToken( instr );
        // Q: Should we use '(' or '{'? (--xxx|-r)={a|b|c} {a|b|c} 
        if ( type == TOKEN_PUNCTUATOR && value === '(' ) {
            const index = instr.lastIndex;
            const {type,values} = readEquivalenceClassTail( instr );
            if ( type !== TOKEN_LITERAL )
                throw instr.error( "only a group of literals", index )
            return values;
        } else if ( type === TOKEN_TYPE ) {
            return value;
        } else if ( type === TOKEN_LITERAL ) {
            return [value];
        }
        if ( type === TOKEN_TYPE_WITH_SUFFIX ) {  
            throw instr.error( ERROR_ILLEGAL_SUFFIX );
        // Q: Should that be treated as [--x=TYPE]...
        // A: No, because it should only be allowed to occur once - even if it takes a list argument.
        } else if ( type === TOKEN_TYPE_LIST ) {
            throw instr.error( `a list is not allowed here (do you want \`[${option}=${value.toUpperCase()}]...\`?)` ); 
        } else { 
            throw new instr.error( "unexpected token" );
        }
    }

function 
readLongOption( option, instr, shortAlias = undefined )
    {
        if ( !RE_LONG_OPTION_VALID.test( option ) ) 
            throw instr.error( ERROR_BAD_OPTION_NAME );
        const negative = option.startsWith( "--no-" );
        const key = CamelCase_fromKebabCase( !negative ? option.slice( 2 ) : option.slice( "--no-".length ) );
        if ( !instr.match( "=" )  ) 
            return createNamed( key, option, negative ? TYPE_FALSE : TYPE_TRUE, shortAlias );
        // We should allow this, e.g. for  
        if ( negative )
            throw new instr.error( "Options beginning '--no-' may not take a value type" );
        const typename = readOptionValue( instr, option );
        return  createNamed( key, option, typename, shortAlias );
    }

function 
readAliasedOption( aliases, instr )
    {
        console.assert( aliases.length === 2 );
        if( !aliases[0].startsWith( "--" ) ) {
            [aliases[0],aliases[1]] = [aliases[1],aliases[0]];
        }
        const option = aliases[0],
              alias = aliases[1];
        if ( !RE_SHORT_OPTION_VALID.test( alias ) ) 
            throw instr.error( ERROR_BAD_ALIAS_NAME );
        return readLongOption( option, instr, alias[1] );
    }

///
/// We're tokenising as well, for fun. But some of that grammer can't be distinguished to the end.
///
/// We do this is the grammar because we don't want to have to run checks in
/// PositionalTree. We used to do it in a separate parse. We might as well spot it here. 
///
/// @note this return traiing ws because the outer loop wants to validate it. 
function
readElidableTail( instr, topLevel = false )
    {
        const valueList = [];
        instr.trimStart();
        let hadNestedElidable = false;
        let hadWs = true;
        for ( ;; ) {
            const {type,value,index:lastIndex,suffix,identifier} = readToken( instr );
            if ( value === ']' ) {
                break;
            } else if ( value === '[' ) { 
                !hadWs
                    && elisionError( instr, ERROR_MISSING_WS );
                hadNestedElidable 
                    && elisionError( instr, ERROR_AMBIGUOUS );
                valueList.push( readElidableTail( instr ) ); 
                hadNestedElidable = true;
            } else if ( value === '(' ) {
                !hadWs
                    && error( instr, ERROR_MISSING_WS );

                const startIndex = lastIndex;
                const {type,values} = readEquivalenceClassTail( instr );
                if ( type === TOKEN_LITERAL || type === TOKEN_TYPE ) {
                    // FIXME: this is an enum type and there's no reason it can't be repeatable
                    // `seq (one|two|three|four|five|six)...`
                    if ( values.length > 1 ) {
                        const variant = { type: type === TOKEN_LITERAL ? NODETYPE_ENUM : NODETYPE_POSITIONAL_VARIANT, value: values }; 
                        if ( instr.match( "..." ) ) {
                            valueList.push( { type: NODETYPE_LIST, value: variant, min: 1 } );
                        } else {
                            valueList.push( variant );
                        }
                    // Harmless, but could be an error?
                    } else if ( values.length === 1 ) {
                        valueList.push( type === TOKEN_LITERAL ? { type: NODETYPE_LITERAL, value: values[0] } : createPositional( values[0], identifier ) );
                    } else {
                        throw new Error( "Empty equivalece classes should be prohibitted" ); 
                    } 
                } else if ( type === TOKEN_TYPE_WITH_SUFFIX || type === TOKEN_TYPE_LIST ) {
                    throw instr.error( "can only construct a variant with pure types (no suffixes, no lists)", startIndex );
                } else if ( type === TOKEN_OPTION ) { 
                    throw instr.error( "unexpected '-' (named options can only appear in a top-level block immediately after the command name)" );
                } else {  
                    throw instr.error( "unknown type for token", startIndex );
                }
            } else if ( type === TOKEN_OPTION ) { 
                throw instr.error( "unexpected '-' (named options can only appear in a top-level block immediately after the command name)" );
            } else if ( type === TOKEN_LITERAL ) {
                valueList.push( { type: NODETYPE_LITERAL, value } );
            } else if ( type === TOKEN_TYPE ) { 
                valueList.push( createPositional( value, identifier ) );
            } else if ( type === TOKEN_TYPE_WITH_SUFFIX ) { 
                valueList.push( createPositionalWithSuffix( value, suffix, identifier ) );
            } else if ( type === TOKEN_TYPE_LIST ) {
                hadNestedElidable 
                    && elipsisError( instr, ERROR_AMBIGUOUS ); 
                hadNestedElidable = true;
                console.assert( typeof suffix === 'undefined' || suffix === '', "no suffix on list" );
                // Can we not have NODETYPE_POSITIONAL_LIST...?
                valueList.push( { type: NODETYPE_LIST, value: createPositional( value, identifier ), min: 1 } );
            } else if ( type === TOKEN_EOF ) {
                if  ( topLevel )
                    break;
                throw instr.error( "expected `]` (unterminated optional block)" );
            } else /*if ( type !== TOKEN_WS )*/ {
                throw instr.error( `unexpected token ${JSON.stringify(value)}`, lastIndex );
            }
            
            // 2022_8_12: This is annoying. But we require ws separation; 
            // for examples: `(y|z)(a|b)`
            //
            // On the other hand [STRING] is fine. And we allow `[ STRING ]`
            hadWs = instr.atEof() || instr.startsWith( END_USAGE, false ) || instr.trimStart(); 
            if ( false && !hadWs ) 
                throw instr.error( "expected whitespace" );
        }
        if ( valueList.length === 0 && !topLevel )
            throw instr.error( "empty `[]` are not allowed!", instr.lastIndex );
        if ( instr.match( "..." ) ) {
            console.assert( !topLevel );
            valueList.length > 1 
                && elipsisError( instr, "can only repeat sections containing a single term" );
            const term = valueList[0];
            term.type === NODETYPE_POSITIONAL || term.type === NODETYPE_NAMED 
                || elipsisError( instr, "unknown type" );
            return { type: NODETYPE_LIST, value: term, min: 0 }; 
        } else {
            if ( !topLevel && valueList.length === 1 && valueList[0].type === NODETYPE_LIST ) {
                const term = valueList[0];
                console.assert( term.min === 1, "list reduction from 1" );
                term.min = 0;
                return term;
            } 
            return valueList;
        }
    }

function
readEndofOptionalOption( term, instr )
    {
        readToken( instr, true ).value === ']'   
            || closureError( instr, ']', 'only one named option per optional block' ) 
        if ( !instr.match( "...", false ) )
            return term;
        return { type: NODETYPE_LIST, value: term, min:undefined };
    }

function
readAnnotation( term, instr ) {
    // We only care that the annotation describes one item. We don't want to allow things like
    // `{[--url]|--idl} -- something` should that become legal - as is intended.
    if ( term.type !== NODETYPE_NAMED && term.type !== NODETYPE_LIST ) 
        return term;
    // FIXME: we should really add an undefined annotation always. But that breaks a lot of the tests.
    return _readAnnotation( term, instr ); 
}



function 
readNamedSequence( instr )  {
    const mandatoryOptions = [],
          optionalOptions = [];
    for ( ;; ) {
        const token = readToken( instr, true );
        if ( token.value === '[' ) {
            instr.trimStart();
            const {type,value} = readToken( instr );
            // if token.type === TOKEN_PUNCUTATOR && token.value === '('
            if ( type === TOKEN_OPTION ) {
                if ( !value.startsWith( "--"  ) ) 
                    throw instr.error( "expected '--' (only long options supported)" );    
                const term = readAnnotation( readEndofOptionalOption( readLongOption( value, instr ), instr ), instr );
                optionalOptions.push( term );
            } else if ( value == '('  ) {
                const prototype = readToken( instr );
                if ( prototype.type === TOKEN_OPTION ) {
                    const {values} = readEquivalenceClassTail( instr, prototype ); 
                    const term = readAnnotation( readEndofOptionalOption( readAliasedOption( values, instr ), instr ), instr ); 
                    optionalOptions.push( term );
                } else {
                    instr.rollback( token.index );
                    break;
                } 
            } else {
                // Lazy but easy.
                instr.rollback( token.index );
                break;
            }
        } else if ( token.value === '(' ) {
            const prototype = readToken( instr );
            if ( prototype.type === TOKEN_OPTION ) {
                const {values} = readEquivalenceClassTail( instr, prototype );
                /*
                if ( !instr.match( "...", false ) )
                    return term;
                return { type: NODETYPE_LIST, value: term, min:undefined };
                */
                const term = readAliasedOption( values, instr );
                mandatoryOptions.push( term );
            } else {
                instr.rollback( token.index );
                break;
            } 
        } else if ( token.type === TOKEN_OPTION ) {
            if ( !token.value.startsWith( "--" ) ) 
                throw instr.error( "expected '--'" );    
            mandatoryOptions.push( readAnnotation( readLongOption( token.value, instr ), instr ) );
        } else {
            instr.rollback( token.index );
            break; 
        }
        // 2022_8_8: [WS1]: This is annoying. But we require ws separation. 
        // Examples: `--x=(y|z)--y` and we really want it for `[--x][--y]` just in case.
        const hadWs = instr.trimStart();
        if ( instr.atEof() || instr.startsWith( "::" ) ) 
            break;
        if ( !hadWs )
            throw instr.error( "unexpected character" );
    }
    return {mandatoryOptions,optionalOptions};
}
    
/// @brief Return an AST describing the "usage" string.
/// 2024_7_30: : `$0` If non null is inserted into the list as $0. Historic. And should be retired.
export default function 
parse( instr, $0 = "" )
    {
        // We could store these in a single, positional list, but what's the point?
        // The next thing we do is split them.
        //
        // Infact, we might as well create the Positionals here and now.
        const positionals = [];
        if ( typeof $0 !== 'string' ) 
            throw new TypeError( "$0 should be a string" );
        if  ( $0 ) {
            // A wildcarded name (`$0`) can be any string - so we just create a
            // STRING positional (that will be ignored). Technically the type should
            // be SCRIPTLET but we're not going to go down that piece of infinite
            // recursion.   
            const $0node = $0 === WILDCARD_NAME 
                         ? createPositional( "String", WILDCARD_NAME ) 
                         : { type: NODETYPE_LITERAL, value: $0 };  
            positionals.push( $0node );
        }
        instr.trimStart(); 
        const {mandatoryOptions,optionalOptions} = readNamedSequence( instr );
        positionals.push( ...readElidableTail( instr, true ) );
        // 2022_8_12: Token doesn't strip this. It probably can, now.
        instr.match( "::", true );  
        return [mandatoryOptions,optionalOptions,positionals];
    }