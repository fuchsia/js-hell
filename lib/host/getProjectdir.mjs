import {existsSync} from "node:fs";
import * as path from "node:path";


export default function
getProjectDir( fileBasename, cwd = ".", { relative = true } = {} )
    {
        const initial = cwd;
        cwd = path.resolve( cwd );
        for( ;; ) {
            // Q: Do we not want this to return the file? (Well we're called getProjectDir...)
            // A: yes, we've frequently thrown away what we are about to reconstruct.
            
            if ( existsSync( path.join( cwd, fileBasename ) ) )
                return !relative ? cwd : ( path.relative( initial, cwd ) || "." );
            const p = path.parse( cwd ); 
            if ( p.dir === "" || p.dir === p.root ) 
                return "";
            cwd = path.join( cwd, '..' );
        }
    }
 

