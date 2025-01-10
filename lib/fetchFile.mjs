import FileSync from "./types/FileSync.mjs";
import { fileURLToPath } from 'node:url';

export default function
fetchFile( url ) {
    
    if ( !"done by caller" && url.protocol.toLowerCase() !== 'file:' )
        throw new TypeError( "Not a file url" );
    
    return ( new FileSync( fileURLToPath( url ) ) ).fetchContentAsResponse();           
}
