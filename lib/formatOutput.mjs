import {inspect} from "node:util";
import {fromObjectArray} from "./output/Table/fromObjectArray.mjs";
import {toMarkdown} from "./output/Table/toMarkdown.mjs";
import toCSV from "./output/Table/toCSV.mjs";
import {AS_SCALAR,AS_ARRAY} from "./bind/consts.mjs";

// We are remported from the builtins.
export {toCSV,toMarkdown,fromObjectArray};

const FORMAT_STRING = 'Str', //< 2023_2_15: Probably required to be 'Str' because that's the type name. FIXME. 
      FORMAT_UTF8 = 'Utf8';  //< 2023_2_15: Historical legacy we can probably do away with. 

// FIXME: separate out encodings; e.g. PSV, CSV and even JSON are string encodings of a table. 

/// These are generally the infer types and should be type names, except in excptional circumstances. (Enum,toString)
export const 
FORMAT_CUSTOM_TO_STRING = Symbol('toString' ),    
FORMAT_JSON = "JSON",
FORMAT_OBJECT = "Object",  // Requires `node:util::inspect.`
FORMAT_LINES = "Lines",    // Array of simple strings
FORMAT_BYTES = "Bytes",    // Array of numbers - could become a buffer.
FORMAT_ENUMLIST = 'Enum',
FORMAT_TABLE = 'Table',    // An array of objects where objects are rows (or arrays?)   
FORMAT_COLUMNS = 'Columns',    // A dictionary where each key is the column name, and the value is the column of values.   
FORMAT_PSV = 'psv',        // PipeSeparatedVariables; i.e. a table. Should this be Table   
FORMAT_NB_PSV = 'nb-psv',  // FIXME: should be a flag. It's neans non-breaking? `output-table-padding`?
FORMAT_CSV = 'csv';  //    

const {toString:builtin_Object_toString} = Object.getPrototypeOf( {} );
export function
inferFormat( result )
    {
        if ( typeof result === 'string' )
            return FORMAT_STRING;
        if ( Buffer.isBuffer( result ) )
            return 'Buffer';
        if ( typeof result === 'object' ) {
            if ( result instanceof ArrayBuffer ) {
                return 'ArrayBuffer';
            } else if ( result instanceof Uint8Array ) {
                // console.assert( result.buffer.isView( result ) );
                return FORMAT_BYTES;
            } else if ( ( result.buffer instanceof ArrayBuffer ) ) {
                // console.assert( result.buffer.isView( result ) );
                return 'ArrayBuferView';
            }
        }
        if ( Array.isArray( result ) ) {
            if( result.every( n => typeof n === 'string' ) ) {
                return FORMAT_LINES;
            }
            // An integer beween 0..255
            else if ( result.every( n => Number.isInteger( n ) && n >= 0 && n <= 255 ) ) {
                return FORMAT_BYTES;
            }
            // If every object is a flat object, and there's some comonality, then 
            // Table/PSV would seem sensible. 
        }
        if ( 
            typeof result === 'object' 
            && result 
         ) {
             if  ( typeof result.toJSON === 'function' ) 
                return FORMAT_JSON;

            // How helpful is this?
            if ( typeof result[Symbol.toStringTag] === 'string' )
                return result[Symbol.toStringTag]; 
             
            // 2022_10_24: Object with toString and no override toJSON -
            // probably stringable.
            // 2023_2_15: Should we limit look at stringification.
            // i.e. do it by looking
            if ( !Array.isArray(result) && result.toString !== builtin_Object_toString ) {
                // FFS, This is different from the UTF8 Above; this needs disentangling.
                return FORMAT_CUSTOM_TO_STRING;
            }
            
            // 2022_10_24: FIXME: outside of toJSON we should be going through
            // the object checking it is properly jsonifiable.
            // But any object whose prototype isn't null or %Object.prototype%
            // probably fails. Also non-enumerable properties might be a flag.
            
            // In these cases we return FORMAT_OBJECT - 
            // except structuredClone might be another option and may be worth spotting.
            return FORMAT_OBJECT;
        } 
        // An array of numbers would strongly suggest defloat as a better format.
        return FORMAT_JSON;
    }

// 2023_6_9: Is this even needed? Can't we just rely on the converter throwing; we're doubling up code here.
export function 
isFormatCompatible( requiredType, inferredType )
    {
        // 2023_5_29: FIXME: more stringe tests required; e.g. should have an ARRAY type.
        if ( requiredType === FORMAT_TABLE && inferredType === FORMAT_OBJECT )
            return true;
        if ( requiredType === FORMAT_OBJECT && ( inferredType === FORMAT_JSON || inferredType === FORMAT_BYTES || inferredType === FORMAT_LINES ) )
            return true;
        if ( requiredType === FORMAT_JSON && ( inferredType === FORMAT_OBJECT || inferredType === FORMAT_BYTES || inferredType === FORMAT_LINES ) )
            return true;
        
        // 2023_6_9: This is the tip of the iceberg, here.
        if ( inferredType === FORMAT_BYTES && requiredType === 'Uint8Array' )
            return true;

        if ( inferredType === FORMAT_UTF8 || inferredType === FORMAT_CUSTOM_TO_STRING )
            inferredType = FORMAT_STRING;
        // FIXME: handle ll the json names in here?
        return requiredType === inferredType;
    }

const sillyLegacyJson = new Map( [
    [ 'json', 4 ],
    [ 'json(4)', 4 ],
    [ 'json<4>', 4 ],
    [ 'JSON', 4 ],
    [ 'json0', 0 ],
    [ 'JSON0', 0],
    [ 'JSON<0>', 0 ],
    [ 'JSON(0)', 0 ]
] );


// If we have an array, should we output it as as eries of arrays.
//
// e.g `cmd :: () as Str[]` invoked as `cmd --output-format=json`
export function
outputComponentsAndCat( {format} )
    {
        return !sillyLegacyJson.has( format );
    }

const NBSP = `\u00a0`;
function 
weak_toString( value, format, _EOL )
    {
        switch( format ) {
            
            case FORMAT_CUSTOM_TO_STRING:
            case FORMAT_UTF8: 
            case FORMAT_STRING: return `${value}`;
            
            case FORMAT_LINES: return Array.isArray(value )? value.join( _EOL ) : value;
            // FIXME: the color problem again.
            case FORMAT_OBJECT: return inspect( value );
            case FORMAT_ENUMLIST: return `{${value.join( ', ' )}}`;
            // This format can be ouput in HTML code blocks and work. We don't use dividers. But you can work out the column widths
            // without needing anything else.
            case FORMAT_TABLE:
                if ( !Array.isArray( value ) )
                    throw new TypeError( "Must be a table, probably" );    
                return toMarkdown( fromObjectArray( value ), { 
                    leading:false,
                    separator:NBSP,
                    trailing:false,
                    padding:NBSP, 
                    eol: _EOL,
                    // If we leave this in, all our NBSPs will be replaced with ordinary SPACE (ASCII 32).
                    collapseWhitespace:false,
                    // NBSP is our separator. So if we leave this in, all our padded NBSPs will be escaped... 
                    escapeSeparator: false,  
                } );
            case FORMAT_COLUMNS:
                if ( !Array.isArray( value ) )
                    throw new TypeError( "Must be a table, probably" );    
                // 2024_8_7: Necessary braindamage because we are toString.
                return JSON.stringify( Object.fromEntries( 
                    fromObjectArray( value ).map( col => [ col.name, col.data ] )  
                ) );
                
            case 'table-ub':
                if ( !Array.isArray( value ) )
                    throw new TypeError( "Must be a table, probably" );    
                return toMarkdown( fromObjectArray( value ), { 
                    leading:false,
                    separator:NBSP,
                    trailing:false,
                    padding:NBSP, 
                    eol: _EOL,
                    // If we leave this in, all our NBSPs will be replaced with ordinary SPACE (ASCII 32).
                    collapseWhitespace:false,
                    // NBSP is our separator. So if we leave this in, all our padded NBSPs will be escaped... 
                    escapeSeparator: false,
                    ubhead: true  
                } );
            // FIXME: we need more control.
            case FORMAT_PSV: if ( !Array.isArray( value ) )
                                throw new TypeError( "Must be a table, probably" );
                            return toMarkdown( fromObjectArray( value ) );
            case FORMAT_NB_PSV: if ( !Array.isArray( value ) )
                                throw new TypeError( "Must be a table, probably" );
                            return toMarkdown( fromObjectArray( value ), { padding: '\u00a0' } );
        
            case FORMAT_CSV: 
                return toCSV( fromObjectArray( value ), {eol: _EOL, } );
        };
        // throw new TypeError( `Missing formatter ${JSON.stringify( format )}` ); 
    }

// Todo: support percent encoding or escape encoding.
function 
toBinary( value, format, EOL, _EOL, textEncoding = 'uf8' )
    {
        // const t = format; // || from; 
        const viaString = weak_toString( value, format, _EOL );
        if ( typeof viaString === 'string' ) {
            return Buffer.from( viaString + EOL, textEncoding );
        }                               
        switch(format) {
            case 'Buffer': return value;
            
            case FORMAT_BYTES: return Buffer.from( value );
            // These conversions are blocked by the isCompatibleFormat.
            case 'ArrayBuffer': return Buffer.from( ArrayBuffer );
            case 'Uint8Array':
            case 'ArrayBufferView': return Buffer.from( value.buffer, value.byteOffset, value.byteLength ); 
            // --output-json-space?
        }
        // Should this not be in weak_toString?
        if ( sillyLegacyJson.has( format )  ) {
            return Buffer.from( JSON.stringify( value, undefined, sillyLegacyJson.get( format ) ) + EOL, textEncoding );
        } 
        
        throw new TypeError( `Unknown format ${JSON.stringify( format )}` );
    }

const binaryEncodings = new Set( [ 'hex', 'base64', 'base64url' ] );

export function
Buffer_fromScalarType( value, from, {format,EOL:_EOL,textEncoding='utf8'}, last = false )
    {
        if ( typeof value === 'undefined' )
            throw new TypeError( "module didn't provide expected output" );
        
        const EOL = last ? '' : _EOL;

        // output-format conflates a lot of things.
        if ( binaryEncodings.has( format ) ) {
            const buffer = toBinary( value, from, EOL, _EOL, textEncoding );
            return Buffer.from( buffer.toString( format ), 'ascii' );
        }
        
        // It would nice to have output-format=ucs2, for example.
        return toBinary( value, format || from, EOL, _EOL, textEncoding );
    }


/// The only difference between this and Buffer_fromOutput is that we want to preserve
/// iterators as iterators. Other than we should follow, possibly including respecting


// Used directly by help *cough*
export function 
formatRowsInColumns( values, width = 80, prefix = "" )
    {
        const strings = values.map( s => typeof s === 'string' ? s : `${s}` ),
              maxStringWidth = Math.max( ...strings.map( s => s.length ) ), 
              
              columnWidth = maxStringWidth + 1,
              leftMargin = prefix.length,
              itemsPerRow = Math.max( Math.trunc( ( width - leftMargin ) / columnWidth ), 1 );
        
        const result = [],
              wrap = ( itemsPerRow - 1 ) * columnWidth + leftMargin;
        let line = prefix;
        for ( const s of strings ) {
            line += s;
            if ( line.length <= wrap  ) {
                // padEnd?
                line += ' '.repeat( columnWidth - s.length );
            } else {
                result.push( line );
                line = ' '.repeat( leftMargin );
            }
        }
        if ( line.length !== 0 ) 
            result.push( line );
        return result;
    }


export const 
MIME_JSON = 'application/json',
MIME_TEXT = 'text/plain';

/// @brief This is used to infer methods we must add to the TopicFileWrapper. @see host/TopicWrapper.mjs
///
/// @param format, mimetype These are received from the `./idl.mjs#getOuputFormatParams()` which
///                         means they are the --output-format and --output-mimetype params; the
///                         latter just a hint. 
export function 
mimetype( {basetype:typeAssertion = 'unknown',enum:enumAssertion = "unknown"} = {}, {format,mimetype}, topic ) {
    if ( enumAssertion === "unknown" ) {
        if ( typeof topic !== 'function' ) {
            // Do we have to worry about things derived from array or array likes?
            enumAssertion = Array.isArray( topic ) ? AS_ARRAY : AS_SCALAR;
        }
    }
    if ( ( enumAssertion === AS_SCALAR || enumAssertion === AS_ARRAY ) ) {
        if ( sillyLegacyJson.has( format ) ) {
            return MIME_JSON;
        }
    }
    // There are a whole bunch we should support here. And this code should be, at mimumum,
    // merged with the above. Could we put it into `UnboundOutputter` so it has a mimetype?
    if ( format === 'csv' ) {

    }
    if ( typeof format !== 'undefined' ) {
        if ( format === FORMAT_CSV )
            return 'text/csv';
        throw new TypeError( "Unsupported format for pipe" ); 
    }
    if ( enumAssertion !== AS_SCALAR )
        return;
    switch ( typeAssertion ) {
        case 'JSON': return MIME_JSON;
        default: if ( typeof topic !== 'string' ) {
                    // Guess JSON?
                    break;
                }
                 // fallthrough. 
        case 'string':
        case 'String': // FIXME: Do we really want to support this? (Or do we want this instead of 'string'?)
        case 'Text': // FIXME: should we ever support this?
            if ( typeof mimetype !== 'string' )
                return MIME_TEXT;
            // FIXME: should vet the mimetype. (FIXME: it should have happened earlier. )
            return mimetype;
    }
}


