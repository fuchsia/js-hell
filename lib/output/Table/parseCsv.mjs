// 2024_4_1: Stolen from Table 03b1444c9ead
import Column from "./Column.mjs";    
const RE_FIELD = /\s*(?:"([^"]*?)"\s*|([^,]*))/g;

/// @brief Attempt to parse a line in CSV format.
export function 
parseCsvLine( ln, parseField = x => x ) {
    const results = [];
    RE_FIELD.lastIndex = 0;
    for (;;) {
        const re = RE_FIELD.exec( ln ); 
        if ( !re )
            throw new Error( "parse failure" );
        const fieldValue = typeof re[1] !== 'undefined'  
                    // a quoted string.
                    ? parseField( re[1], true )   
                    // an unquoted string
                    : parseField( re[2].trim(), false );
         
        results.push( fieldValue );
        if ( RE_FIELD.lastIndex === ln.length )
            return results;

        if ( ln[RE_FIELD.lastIndex] != ',' )
            throw new Error( "parse failure" );

        RE_FIELD.lastIndex++;
    }
}

const isBlank = text => !text.length;
    
export default function 
parseCsv( csvText, optionsOrParseField ) {

    const parseField = typeof optionsOrParseField === 'function' ? optionsOrParseField : undefined;
    const lns = csvText
                .split(/\s*$\s*/m)
                // Filtering these out here means the ine indexes are wrong.
                .filter( ln => !isBlank(ln) );

    // Yup, really seen this. (2024_4_1: When? Can we kill? )
    if ( lns.at( -1 ) === String.fromCharCode(0) )
        lns.pop();
    
    const columns = parseCsvLine( lns[0] ).map( columnName => new Column( columnName ) );
    
    for (let lnIndex = 1; lnIndex < lns.length; ++lnIndex ) { 
        const row = parseCsvLine( lns[lnIndex], parseField );
        const columnsInRow = row.length; // `row.length < columns.length` confused me...
        if ( columnsInRow < columns.length )
            throw new TypeError( `too few columns in row ${lnIndex}`  );
        for ( let c = 0; c < columns.length; ++c ) {
            columns[c].data[lnIndex-1] = row[c];
        }
        for ( let c = columns.length; c < columnsInRow; ++c ) {
            // We don't complain about trailing non-blank columns. This happens in 
            // my Natwest DB.
            if ( !isBlank( row[c] ) )
                throw new TypeError( `too many columns in row ${lnIndex}`  );
        }
    }
    for ( let c = columns.length - 1;
            c >= 0
            && columns[ c ].name === ''
            && columns[ c ].data.every( isBlank );
         c-- )
         columns.pop();
    return columns;
};




