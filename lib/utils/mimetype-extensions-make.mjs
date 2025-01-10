export const js_hell = "API=1 mimetype-extensions-make JSON_FILE :: default( $1.toJSON() ) as JSON";

function 
removeDuplicateEntries( objectEntries ) {
    const seen = new Set,
          multiples = new Set;
    // Annoying we need to pass it twice; means we can't use an iterator.
    for ( const [key] of objectEntries ) {
        if ( seen.has( key ) ) 
            multiples.add( key );
        else
            seen.add( key );
    }
    console.warn( "eliminated:", ...Array.from( multiples ).filter( key => !Object.hasOwn( extrasAndReplacementsAndHardOverrides, key ) ) );
    const result = [];
    for ( const entry of objectEntries ) {
        const [key] = entry;
        if ( !multiples.has( key ) ) {
            result.push( entry ); 
        } 
    }
    return result;
}

const extrasAndReplacementsAndHardOverrides = {
    // 2024_5_28: override:
    '.mjs': 'application/module+javascript',
    // 2024_5_28: missing, and the .sq3 is customary
    '.sq3': 'application/vnd.sqlite3',
    '.sqlite3': 'application/vnd.sqlite3',
    // 2024_5_28: conflicting - take an opinion:
    '.exe': "application/octet-stream",
    '.dll': "application/octet-stream",
    '.msi': "application/octet-stream",
    '.dmg': "application/x-apple-diskimage",
    '.mp3': "audio/mpeg",
    '.xml': "text/xml",
     
};
 
export default function( json ) {
    
    const result = Object.entries( json ).flatMap( ([mimetype,{extensions=[]}]) => 
        extensions.map( extension => [ `.${extension}`, mimetype ] )
    );
    return Object.fromEntries( 
        Object.entries( 
            Object.assign( 
                Object.fromEntries( removeDuplicateEntries( result ) ),
                extrasAndReplacementsAndHardOverrides 
            ) 
        ).sort( ( a, b ) => a[0].localeCompare( b[0] ) ) 
    );
}