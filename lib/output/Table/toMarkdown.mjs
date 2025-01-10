/* copied from 1:5a3feb774b3f Tue Dec 03 20:47:31 2024 +0000 */
function 
despace( c )
    {
        return c.trim( ).replaceAll( /\s+/g, ' ' );
    }

function
customAlign( callback, text, maxLength, fieldPadding, enablePadding = true )
    {
        const result = callback( text );
        if ( result === 'start' ) {
            return enablePadding ? text.padEnd( maxLength, fieldPadding ) : text;
        } else if ( result === 'end' ) {
            return text.padStart( maxLength, fieldPadding );
        } else if ( result === 'none' ) {
            return text;
        } else {
            throw new TypeError( "Callback returned unknown alignment" );
        }
    }

// Currency types as well? Is there a unicode currency type?
const numeric =  /^[-+]?(?:\d+(?:\.\d+)?|\.\d+)%?$/;
function
guessAlign( text ) {
    return numeric.test( text ) ? 'end' : 'start';
}

function
formatField( value, {collapseWhitespace, escapeSeparator, separator, quotedSeparator } ) {
    let text = `${value}`;
    if ( collapseWhitespace )
        text = despace( text );
    if ( escapeSeparator )
        text = text.replaceAll( separator, quotedSeparator ); 
    return text;
}

// This isn't always to makrdown. It's too padded output.
export function
toMarkdown( columns, {escapeSeparator=true,separator='|',leading=true,trailing=false,padding=' ',
    collapseWhitespace=true, //< Replace multiple runs of whitespace **inside the field itself**
                             //< with a single space.
    
    eol='\n',ubhead=false,columnHeadings=true,} = {} )
    {
        const quotedSeparator = `\\${separator}`; 
        // Is it worth calling pivot?
        const columnsAsStrings = [];
        let rowCount = 0;
        for ( let i = 0; i < columns.length; ++i ) {
            const { name, data, align = 'auto', padding:fieldPadding = padding, maxWidth = 0 } = columns[i];
            const title = formatField( name, {collapseWhitespace,escapeSeparator,separator,quotedSeparator} );
            let maxLength = title.length;
            const output = !ubhead ? [ title, '' ] : [ title ];
            for ( const value of data ) {
                let text = formatField( value, {collapseWhitespace,escapeSeparator,separator,quotedSeparator} );
                // worth doing this in the above.
                if ( text.length > maxLength )
                    maxLength = text.length;
                output.push( text );
            }
            if ( !ubhead ) {
                output[1] = '-'.repeat( trailing || i < columns.length - 1 ? maxLength : output[0].length );
            }
            if ( maxWidth > 0 && maxLength > maxWidth )
                maxLength = maxWidth;
            
            const cSeparator = i < columns.length - 1 || trailing ? separator : '';
            const enablePadding = i < columns.length - 1 || trailing;
            console.log( "column", i, enablePadding );
            // Should we allow `none` and `center`? (cf. customAlign which allows `none`).
            const padAlign = typeof align === 'function' ? ( text, maxLength, fieldPadding ) => customAlign( align, text, maxLength, fieldPadding )
                           : align === 'auto'            ? ( text, maxLength, fieldPadding ) => customAlign( guessAlign, text, maxLength, fieldPadding, enablePadding ) 
                           : align  !== 'end'            ? ( enablePadding ? ( text, maxLength, fieldPadding ) => text.padEnd( maxLength, '.' ) : text => text )
                                                         : ( text, maxLength, fieldPadding ) => text.padStart( maxLength, fieldPadding );
            
             
            for ( let i = 0; i < output.length; ++i ) {
                output[i] = padAlign( output[i], maxLength, fieldPadding ) + cSeparator; 
            }
            if ( ubhead ) {
                const paddedTitle = output[0];
                let finalTitle = `<u>${paddedTitle.slice( 0, paddedTitle.length - cSeparator.length )}</u>`;
                if ( i === 0 ) { 
                    finalTitle = '<b>' + finalTitle;
                } else if ( i === columns.length - 1 ) {
                    finalTitle += '</b>';
                }
                output[0] = finalTitle + cSeparator;
            }
            const rows = output.length;
            columnsAsStrings.push( output );
            if ( rows > rowCount )
                rowCount = rows;
        }
        let result = '';
        const leader = leading ? separator : '';
        // FIXME: this is broken if they have differing rowCounts.
        for ( let j = columnHeadings ? 0 : 2; j < rowCount; ++j ) {
            result += leader;
            for ( let i = 0; i < columnsAsStrings.length; ++i ) {
                // FIXME: should do this is another pass. And should cache the string.
                result += columnsAsStrings[i][j] ?? ' '.repeat( columnsAsStrings[i][0].length );   
            }
            result += eol;
        }
        return result;
    }

