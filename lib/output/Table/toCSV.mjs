



// 2024_12_3: cf with the markdown formatter. The break point for writing a separate
// outputter was the quoting needs. 
export default function toCSV( columns, {eol} = {} ) {
    
    
    const r = [];
    for ( const c of columns ) {
        r.push( JSON.stringify( c.name ) );  
    }
    let result = r.join( ',' ) + eol;
    for ( let row = 0; row < columns[0].data.length; ++row ) {
        r.length = 0;
        for ( const {data} of columns ) {
            r.push( JSON.stringify( data[row] ) );  
        }
        result += r.join( ',' ) + eol;
    }
    return result;
}

// The CSV command needs this to be a blob or as "text/csv" 
