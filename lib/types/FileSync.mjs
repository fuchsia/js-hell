import {readFileSync,writeFileSync,openSync,writevSync,closeSync,unlinkSync,statSync} from "node:fs";
import { pathToFileURL } from 'node:url';
import {basename as Path_basename,resolve as Path_resolve,relative as Path_relative,extname as Path_extname} from "node:path";
import getFileType,{FILETYPE_DIR,FILETYPE_FILE,FILETYPE_MISSING} from "../utils/getFileType.mjs";
import File from "./File.mjs";
import lookupMimeTypeFromExtension from "../utils/lookupMimeTypeFromExtension.mjs";
import {realiseTo} from "../consts.mjs";
// 2024_10_15: Prior to ?18.0 we can only find Blob by importing node:buffer.
import {Blob} from "node:buffer";
import getDatabase from "./database.mjs";

export function 
writev( filename, buffers )
    {
        // We let the error propogate naturally heree.
        const fh = openSync( filename, 'w' );
        let wroteSuccessfully = true,
            removedSuccessfully = false;
        try {
            writevSync( fh, buffers );
        } catch ( err ) {
            console.error( err );
            wroteSuccessfully = false;
        }
        try {
            closeSync(fh);
        } catch( err ) {
            // A failure of close probably means the file wasn't written successfully.
            if ( wroteSuccessfully ) {
                wroteSuccessfully = false;
                console.error( err );
            }
        }
        if ( !wroteSuccessfully ) {
            try {
                // If a mounted volume went away mid write, this will fail too.
                // Congrats: you have a corrupted file and there is nowt we can do.
                unlinkSync( filename );
                removedSuccessfully = true;
            } catch( err ) {
                console.error( err );
            }
            // There's a third case where it existed before and we've corrupted it...
            throw new Error( removedSuccessfully ? "failed to write file" : "failed to write file - it's probably corrupt" );    
        }

    }


/// @brief This spoofs File and possibly FileSystemFileEntry while providing custom casts.
///
/// The reason we don't use file is because that would force us to always load the file 
/// (look at file - it's derived from a blob) and this avoids that. That's it. 
export default class 
FileSync
{
    #getContentAsBuffer;  //< function: use this instead of fs.readFileSync, and all the stat madness.
    #basename;
    #webkitRelativePath;
    #fullPath;
    #text;
    #buffer;
    #stat;
    #type = '';

    // 2022_9_3: We deliberately make this a property, so it can be overriden.
    // 2024_12_1: And it frequently is. 
    [realiseTo] = 'Buffer';

    constructor( filename, cwd = ".", stat, mimetype, getContentAsBuffer )
        {
            if ( typeof cwd !== 'string' )
                cwd = cwd.fullPath;
            // FIXME: we need to guarantee the webkitRelativePath is relative. It will be if it has come through file sync,
            // but that is not the only route. (And, in which case, are we better doing it here
            // and getting glob to return absolute paths.)
            this.#fullPath = Path_resolve( cwd, filename ); 
            this.#webkitRelativePath = filename; //Path_relative( cwd, this.#fullPath );
            this.#basename = Path_basename( this.#fullPath );
            if ( typeof stat !== 'undefined' )
                this.#stat = stat;
            // If we are also spoofing FileSystemFileEntry we also need fullPath
            this.#type = mimetype ?? lookupMimeTypeFromExtension ( Path_extname( this.#basename ) );
            this.#getContentAsBuffer = getContentAsBuffer;
        }
            

    // 2023_10_10: Surely, this should be called `fromPath()` or something or `fromUrl()`?
    static fromString( filename, {cwd, stat, mimetype} )
        {
            return new FileSync( filename, cwd, stat, mimetype );
        }
    
    // Friend method, hidden from user:
    // We could remove this from the prototype and have a regular function?
    static #_stat( file )
        {
            if ( typeof file.#stat !== 'undefined' )
                return;
            // Store missing as null so we can distinguish it from not having been called.
            file.#stat = statSync( file.#fullPath, { throwIfNoEntry: false } ) ?? null;
        }

    /// @brief Companion to the setValueAs... Marks us out as a data provider.
    getContentAsBuffer()
        {
            if ( this.#buffer )
                return this.#buffer;

            if ( this.#getContentAsBuffer ) {
                return this.#buffer = this.#getContentAsBuffer();
            }
            
            // Q: Could we get away with making an after the fact stat call and
            // checking the size?
            //
            // (NB, if we did that, we would still have to validate any extant stat matched).
            //
            // Q: If we have stat already, should we check they match first, and abort reading 
            // any file if they don't match up?
            const s1 = typeof this.#stat === 'undefined' ? statSync( this.#fullPath, { throwIfNoEntry: false } ) : this.#stat; 
            
            // NB this should throw with DOMException( message, "NotFoundError" )
            this.#buffer = readFileSync( this.#fullPath );
            
            // Q: Could we elide the this call? 
            // A: No. The user could access lastModified subsequent to this; cf
            // `toFile()`. 
            const s2 = statSync( this.#fullPath, { throwIfNoEntry: false } );
            // Hey, this could be a network filesystem.
            if ( s1.size !== s2?.size || s1.mtimeMS !== s2?.mtimeNS )
                // This should new DOMException( message, "NotReadableError" )
                throw new Error( `File changed while we were reading it, for ${JSON.stringify( this.#webkitRelativePath )}` );
            
            if ( typeof this.#stat === 'undefined' ) {
                // Should we use s2 and record our access, come what may?
                this.#stat = s1;
            }
            return this.#buffer; 
        }

    
    // Spoof Blob properties:
    get type() { return this.#type }
    get size() {
            // If we have been loaded, we have also been statted. But,
            // it would be nice if we could elide it.
            if ( this.#buffer )
                return this.#buffer.byteLength; 
            FileSync.#_stat( this );
            return this.#stat?.size ?? NaN; 
        }

    // Spoof File properties:
    get name() { return this.#basename }
    get webkitRelativePath() { return this.#webkitRelativePath }
    get lastModified() {
            FileSync.#_stat( this );
            return this.#stat?.mtimeMs ?? NaN;
        }
    
    // FileSystemEntry property: defer to fileSystemEntry itself?
    get fullPath() { return this.#fullPath }

    
    static #getFileType( file ) {
        FileSync.#_stat( file );
        return getFileType( file.#stat );
    }
    // Spoof FileSystemEntry methods:
    get isFile()
        {
            // NB Streams return false. So this can separate a regular file from a stream.
            return FileSync.#getFileType( this ) === FILETYPE_FILE;
        }
    
    // 2024_5_3: Historic. It's actually isDirectory in the spec. Ugh.
    get isDir() { return FileSync.#getFileType( this ) === FILETYPE_DIR }
    
    get isDirectory() { return FileSync.#getFileType( this ) === FILETYPE_DIR }
    
    get filesystem()
        {
            throw new TypeError( "Not implemented" );
        }

    // Bespoke conversion:
    // It needs to be this for type realisation: we pass on what the user typed.
    toFilename() { return this.#webkitRelativePath }
    
    toURL() { return pathToFileURL( this.#fullPath ) }

    // 2022_10_14: Necessary for `[realiseTo] = 'buffer'`.  
    toBuffer()   { return this.getContentAsBuffer() }
    async buffer() { return this.getContentAsBuffer() }

    toArrayBuffer()
        {
            const buffer = this.getContentAsBuffer();
            if ( buffer.byteOffset !== 0 || buffer.length !== buffer.buffer.byteLength ) {
                return buffer.buffer.slice( buffer.byteOffset, buffer.byteOffset + buffer.length ); 
            }
            return buffer.buffer;
            
        }
    async arrayBuffer()
        {
            return this.toArrayBuffer();
        }
    toText() {
        if ( typeof this.#text !== 'undefined' ) 
            return this.#text;
        
        // Do we really want to cache this - potentially doubling our memory footprint?
        return this.#text = this.getContentAsBuffer().toString( 'utf8' );
    }
    // Is there a case for using an async method here - if we haven't already loaded the file? 
    async text() { return this.toText( ) }
        
    
    // 2022_10_14: This is not `Deferral.map( this.buffer(), buffer => new Blob(  buffer ) )` because it would use
    // `this.type` in the map function; so it's not an independent function.
    // 2023_7_11:  Why is this deferred? You wouldn't expect to await on it.
    async blob() { return new Blob( [ this.getContentAsBuffer() ], { type: this.type } ) }
     
    file() { 
        return new File( [ this.getContentAsBuffer() ],  this.name, { type: this.type } )  
    }
    
    toJSON() { return JSON.parse( this.toText() ) }
    async json() { return JSON.parse( await this.text() ) }
    
    formData() { throw new TypeError( "Method formData not impelemented" ); }

    /// @brief This is only async because we dynamically import. If not we could use a Deferral. Do we need async import?
    async database( defaultTableName = "data" ) {
        // const {default:getDatabase} = await import( "./database.mjs" );
        return getDatabase( this, defaultTableName );
    }

    *toLines() {
        // FIXME: we should be able to buffer a file rather than fully load.
        // But it does for now.
        let lastIndex = 0;
        const text = this.toText();
        /*for ( const {index,0:match} of text.matchAll( /\r?\n/g ) ) {
            yield text.slice( lastIndex, index );
            lastIndex = index + match.length;
        }*/
        for ( ;; ) {
            const index = text.indexOf( '\n', lastIndex );
            if ( index === -1 ) 
                break;
            const lineEndIndex = index && text.charCodeAt( index - 1 ) === 13 ? index - 1 : index; 
            yield text.slice( lastIndex, lineEndIndex );
            lastIndex = index + 1;
        }
        if ( lastIndex < text.length ) {
            yield text.slice( lastIndex, text.length );
        } 
    }

    async* lines() {
        // FIXME: we should be work with the file a stream so that we can don't have to
        // hold all the data.
        yield *this.toLines();     
    } 
    
     

    // Js-Hell private methods...
    setValueAsBufferVector( result )
        {
            this.#buffer = undefined;
            this.#text = undefined;
            this.#stat = undefined;
            writev( this.#fullPath, result );
        }
    
    setValueAsBuffer( result )
        {
            this.#buffer = undefined;
            this.#text = undefined;
            this.#stat = undefined;
            writeFileSync( this.#fullPath, result );
        }

    // setContentFromBuffer( bufer )

    async fetchContentAsResponse()
        {
            // NB Response theoretically supports web streams, so we could use that here.
            //
            // FIXME: there is an url value in the response, but it's not clear how we set it.
            // (Location?) And we do need to set it. 
            const {type,lastModified}=this;
            
            return new Response(
                // A Blob is legal here, as is a readable stream...
                // There's no way to set the URL.
                this.getContentAsBuffer(), {
                    status: 200,
                    statusText: "OK",
                    headers: new Headers( [
                        [ 'Last-Modified', ( new Date(lastModified) ).toGMTString() ],
                        ...type ? [[ 'Content-Type', type ]] : []
                    ]) 
                } 
             );
        }

    
    slice() { throw new TypeError( "Method slice not implemented" ); }

        
    stream() { throw new TypeError( "Method stream not implemented" ); }
    
    
    
};

 

