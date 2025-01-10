import Instr from "../Instr.mjs";
import {
RE_BAREWORD,
RE_TO_EOL_INCLUSIVE as RE_TO_EOL,
readOptionallyQuotedValue,
_readAnnotation,
END_USAGE, WILDCARD_NAME,
} from "../re.mjs";
import { fromKebabCase as CamelCase_fromKebabCase, fromSnakeCase as CamelCase_fromSnakeCase } from "../utils/CamelCase.mjs";

export const 
ERROR_EXPECTED_SCRIPTLET_NAME = "Expected SCRIPTLET_NAME",
ERROR_EXPECTED_WS = "Expected whitespace",
ERROR_INVALID_VERSION = "Invalid version string",
ERROR_EXPECTED_TOKEN_END = "Illegal character",
ERROR_EXPECTED_VALUE = "Expected value"; // `VAR= something`, `VAR=::`, `VAR=`

const RE_VAR_VALUE_NUMERIC = /\d+(?=\s)/y;
const _RE_VAR_VALUE_NUMERIC = /\d+/y;

function
EnvName_from( name, instr ) {
    if ( name.toUpperCase() !== name )
        throw instr.error( "Environment variables must be composed of UPPERCASE letters" ); 
    if ( name.includes( '-' )) {
        if ( name.includes( '_' ) )
            throw instr.error( "Environment variables cannot mix SNAKE_CASE (underscores) with KEBAB-CASE (hyphens)" );
        // Should this print?
        instr.warn( "Environment variables should use SNAKE_CASE (underscores) not KEBAB-CASE (hyphens)" );
        return CamelCase_fromKebabCase( name.toLowerCase() );
    } else {
        return CamelCase_fromSnakeCase( name.toLowerCase() );
    }  
}

function
atTokenEnd( instr, trim = false ) {
    // The string `x[]` would provide the name `x` and terminate at the `[]`. 
    // We don't permit that: it must be `x::` or `x ` or `x`
    return instr.atEof() || instr.startsWith( END_USAGE ) || ( trim ? instr.trimStart() : instr.startsWith( /\s/y ) );
}

const CODE_UPPER_A = 'A'.charCodeAt( 0 ),
      CODE_LOWER_A = 'a'.charCodeAt( 0 );

/// @brief Read gthe versions tring we use. Used by the `CLI=xxx` code in the CLI host.
export function 
readVersion( instr ) {
    const majorText = instr.match( /\d+/y, false );
    if ( majorText === '' )
        throw instr.error( ERROR_INVALID_VERSION );
    const major = parseInt( majorText, 10 );
    if ( major === 0 )
        throw instr.error( ERROR_INVALID_VERSION );
    // `1` counts as 1.0, `1a` as 1.1, etc... with `1A`
    // as `1.27`, etc.. (I thought of also allowing `x.y`, 
    // but keep it simple: this is our format.)
    // 
    // NB `1aa` is so horrible I'm banning it now. If you can't
    // do it in `1.52` then time for a new major. (Words I
    // might regret.)  
    const minorText = instr.match( /[A-Za-z]?/y, false );
    let minor = 0;
    if ( minorText.length ) {
        const c = minorText.charCodeAt( 0 );
        if ( c < 'a'.charCodeAt( 0 ) ) {
            minor = 26 + c - CODE_UPPER_A;
        } else {
            minor = c - CODE_LOWER_A;
        }
        ++minor;
    }
    if (  !atTokenEnd( instr, true ) )
        throw instr.error( ERROR_INVALID_VERSION );
    return { major, minor, text: majorText + minorText };
}

/// @brief The `IDL=x` token is special: it selects which parser to use. 
/// So it must be first. And we must have special, universal rules to 
/// handle it.
///
/// Q: Do we want this to throw - cf. isNewIdl which tests for it?
/// A: That should vanish.
function
readApi( instr ) {
    instr.trimStart(); // We really want to do away with this.

    if ( !instr.match( "IDL=", false ) ) {
        // Q: Why not /^\s*API=(?<version>\S*)\s+/ We then test result.groups.version = "1" 
        // and swear.
        if ( !instr.match( "API=", false )  ) 
            throw instr.error( "Expected `IDL=<version>` as first token." );
        console.warn( "deprecated: use of `API=` instead of `IDL=`" ); 
    } 
    return readVersion( instr );
}

const RE_BLANK_TO_EOL = /\s*?(?:\r?\n|$)/y,
      RE_WS_NOT_EOL = /\s*?(?=\r\n?|\n|\S|$)/y,
      RE_NL = /\r\n?|\n/y,
      RE_WS = /\s/y;
        

// This differs from the one in ../usage/parse in that the latter requires initial WS - 
// i.e. uses a slightly different initial RE_ANNOTATION. Which is very irritating. 
function
readAnnotation( instr ) {
    const result = [];
    let para = '';
    const nextPara = () => {
        if ( !para )
            return;
        result.push( para );
        para = '';   
    };
    for ( ;; ) {
        instr.match( RE_WS_NOT_EOL, false );
        if ( instr.atEof() ) {
            break;
        } else if ( instr.match( "--", false ) ) {
            if ( instr.atEof() ) {
                break;
            } else if ( !instr.startsWith( RE_WS ) ) {
                // This corresponds with finding "--x" in the input stream.
                // That will give rise to ERROR_EXPECTED_SCRIPTLET_NAME. But 
                // that's not helpful diagonostic when it is almost certainly 
                // a missing space character.
                //
                // NB if we hit an EOF, then ERROR_EXPECTED_SCRIPTLET_NAME is 
                // legit.
                throw instr.error( ERROR_EXPECTED_WS ); 
            } else if ( instr.match( RE_BLANK_TO_EOL, false ) ) {
                nextPara();
            } else {
                const lineText = instr.match( RE_TO_EOL, false );;
                para += lineText;  
            }
        } else if ( instr.match( RE_NL ) ) { 
            nextPara();
        } else {
            break;
        }
    }
    nextPara();
    return result;
}

const reservedNames = new Set( ["idl", "details", "summary", "defaults","api","name"] );
export function 
_parse( instr ) {
    // FIXME: this should be merged with shtok - except without the `--` and `-` prefixes.
    // FIXME: `env` should be a `Map()`
    // TODO: this needs to take the literal command as well - 
    const env = {
        // api:undefined,
        // name: undefined?
        idl:undefined};

    for ( ;; ) {
        const nameStartIndex = instr.pos;
        // Our definition of "bareword" allows a lot of punctuation - including names beginning
        // with '-'. So exclude any such case here.  
        if ( instr.startsWith( "-" ) ) 
            throw instr.error( ERROR_EXPECTED_SCRIPTLET_NAME );
        // OTOH "$0" doesn't count as a bareword so we have to include it here.
        const varName = instr.match( RE_BAREWORD, false ) || instr.match( WILDCARD_NAME );
        if ( !varName ) 
            throw instr.error( ERROR_EXPECTED_SCRIPTLET_NAME );
        if ( varName === WILDCARD_NAME || !instr.match( "=", false ) ) {
            if ( !atTokenEnd( instr, false ) ) 
                throw instr.error( ERROR_EXPECTED_TOKEN_END );
            const {annotation} = _readAnnotation( {}, instr );
            env.idl = instr.getText().slice( instr.pos );
            env.name = varName;
            // Too lazy to rewrite tests. But this should always be here.
            if ( typeof annotation !== 'undefined' ) 
                env.summary = annotation;
            return env;
        }
        const envName = EnvName_from( varName, instr );
        // Q: Should we be doing this?
        // A: We have to as IDL is privileged and we store the remains of the string there.
        // We should probably return `[idl,vars]` or something so we can catch all vars. 
        if ( reservedNames.has(envName ) )
            throw instr.error( `Environment variable uses reserved name (${envName})`, nameStartIndex );
        // There are some for which this may make sense. e.g. `EXCLUDE=.* EXCLUDE=*.bak` 
        if ( Object.hasOwn( env, envName ) )
            throw instr.error( `Environment variable redeclared (${envName})`, nameStartIndex );  
        if ( atTokenEnd( instr, false ) ) 
            throw instr.error( ERROR_EXPECTED_VALUE );
        let value;
        // Q: Is "12n" a valid unquoted value or should we force it to be quoted?
        // Q: Should this be folded into readOptionallyQuotedValue?
        if ( instr.match( RE_VAR_VALUE_NUMERIC, false ) !== '' ) {
            // Some other varieties of instr have this as `instr.keep()` or `instr.lastMatch` or something.
            value = parseInt( instr.slice( instr.lastIndex ), 10 );
        } else {
            value = readOptionallyQuotedValue( instr );
        }
        if ( !atTokenEnd( instr, true ) ) 
            throw instr.error( ERROR_EXPECTED_TOKEN_END );
        env[envName] = value.valueOf();
    }
}

export default function  
parse( idl, { extractName = false } = {} ) {
    if ( extractName === false )
        throw new TypeError( "No extract name" );
    const instr = new Instr( idl );
    const {major,minor} = readApi( instr );
    const annotation = readAnnotation( instr );
    const env = _parse( instr );
    // 2024_10_18: Temporary hack. Fix this to a pure int once
    // we start incrementing the subversion.
    env.api = major + minor / 100; 
    if ( annotation.length ) {
        // NB `summary` can also be set as an annotation to $0. In which case we override it
        // with that to the API. Which is historicallty what happened.
        env.summary = annotation[0];
        env.details = annotation.slice( 1 );
    }
    return env;
}

  
