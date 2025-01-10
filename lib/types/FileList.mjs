import FileSync from "./FileSync.mjs";
import Dir from "./Dir.mjs";
import glob from "../glob.mjs";
import * as path from "node:path";
import Sequence from "../utils/Sequence.mjs";

function
Any_map( t, callback )
    {
        if ( Array.isArray( t ) )
            return t.map( callback );
        else 
            return callback( t, 0 );
    }

function*
FileList_fromStringsAndFiles( filespecsAndFiles = [], {extensions,exclude,cwd,recurse,dirs=false,files = true} = {} )  
    {
        const cwdString = typeof cwd === 'string' ? cwd : cwd.fullPath;
        const filespecs = [];
        // 2024_8_7: 1. It annoys me that we do files out of order. But glob does this anyway.
        // 2024_8_7: 2. Break out the glob filtering so we can do it and handle this as part of that.
        for ( const f of filespecsAndFiles ) {
            if ( f instanceof FileSync || f instanceof Dir ) {
                yield f;
            } else if ( typeof f === 'string' ) {
                filespecs.push( f );
            } else {
                throw new TypeError( "Filespec must be a string or a File" );
            }
            
        }
        const subdirGlob = Any_map( extensions, n => `*${n}` );
        for ( const filename of glob( filespecs, { recurse, glob: subdirGlob, exclude, cwd: cwdString , return: { dirs, files } } ) ) {
            // FIXME: there is a race condition where the file can disappear between the above and us trying to construct
            // the File.
            //
            // We remove the trailing slash to normalise here. It's up to dir whether it keeps it. It should probably normalise
            // with it - but relative paths...
            yield filename.endsWith( path.sep ) ? new Dir( filename.slice( 0, -1 ), cwd ) : new FileSync( filename, cwd );
        }
    }

export default function
( filespecs, params ) {
    return new Sequence( FileList_fromStringsAndFiles( filespecs, params ) );
}
