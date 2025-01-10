import {statSync} from "node:fs";
import {pathToFileURL} from 'node:url';
import safeStateSync from "../utils/safeStatSync.mjs";
import {basename as Path_basename, resolve as Path_resolve, relative as Path_relative} from "node:path";
import getFileType,{FILETYPE_DIR,FILETYPE_FILE,FILETYPE_MISSING} from "../utils/getFileType.mjs";
import {realiseTo} from "../consts.mjs";
import FileList_fromStringList from "./FileList.mjs";
// 2023_2_11: Added so getFile() works so we can load default files via `cwd.getFile()`. Is there another way?
import FileSync from "./FileSync.mjs";

/// @brief This spoofs FileSystemDirectoryEntry while providing some File members and other custom casts.
export default class 
Dir
{
    #basename;
    #webkitRelativePath;  
    #fullPath;
    #stat;

    // Deliberately a property (rather than static) so it can be overrided.
    [realiseTo]; //  = 'Filename';

    constructor( filename, cwd = ".", stat = null )
        {
            if ( cwd instanceof Dir )
                cwd = cwd.fullPath;
            // FIXME: should we should standardise the trailing `\` (or `/`). It depends
            // on the route as to whether we have it.
            this.#fullPath = Path_resolve( cwd, filename ); 
            this.#webkitRelativePath = filename; // Path_relative( cwd, this.#fullPath );
            this.#basename = Path_basename( filename );
            this.#stat = stat || safeStateSync( this.#fullPath );
            const type = getFileType( stat );
            if (  type !== FILETYPE_DIR && type !== FILETYPE_MISSING )
                throw new TypeError( `${JSON.stringify(filename )} is not a directory` );
            
            // If we are also spoofing FileSystemFileEntry we also need fullPath

            // FIXME: we need to assert this is a dir. If somebody knows we are a dir, they probably have
            // a stat that we should have access to.
        }

    static fromString( filename, {cwd} )
        {
            return new Dir( filename, cwd );
        }

    static fromFullPath( filename )
        {
            return new Dir( filename );
        }
    
    // Spoof Blob properties:
    get size()
        {
            return NaN;
        }
    
    get type()
        {
            // We could infer the mimetype form the name, but...
            return "";
        }

    // Spoof File properties:
    get name()
        {
            return this.#basename;
        }

    get webkitRelativePath()
        {
            return this.#webkitRelativePath;
        }

    
    /// @brief FileSystemEntry method
    get fullPath()
        {
            return this.#fullPath;
        }
    
    get lastModified()
        {
            this._stat();
            return this.#stat?.mtimeMs ?? NaN;
        }
    
    // Spoof FileSystemEntry methods.
    get isFile()
        {
            return getFileType( this._stat() ) === FILETYPE_FILE;
        }
    
    get isDir()
        {
            return getFileType( this._stat() ) === FILETYPE_DIR;
        }
    get isDirectory()
        {
            return getFileType( this._stat() ) === FILETYPE_DIR;
        }
    
    get filesystem()
        {
            throw new TypeError( "Not implemented" );
        }

    // Synthetic, but.
    get exists()
        {
            // This is a race hazard, but then so are all the rest. 
            return getFileType( this._stat() ) !== FILETYPE_MISSING;
        }
    
    // FileSystemDirectoryEntry - ish.
    getFile( filename )
        {
            //if ( !filename.endsWith( path.sep ) )
                return new FileSync( filename, this );
            /*else
                return new Dir( filename, this );*/
        }
    
    
    getDir( filename )
        {
            return new Dir( filename, this );
        }

    glob( pathsAndSpecs = "*", options = {} )
        {
            return FileList_fromStringList( pathsAndSpecs, { dirs: true, files: true, ...options, cwd: this.#fullPath })
        }
    
    
    // Internal methods:
    _stat()
        {
            if ( typeof this.#stat !== 'undefined' )
                return this.#stat;
            // Store missing as null so we can distinguish it from not having been called.
            return this.#stat = statSync( this.#webkitRelativePath, { throwIfNoEntry: false } ) ?? null;
        }


    toFilename()
        {
            return this.#webkitRelativePath;
        }

    toDirname()
        {
            return this.#webkitRelativePath;
        }
        
    toURL()
        {
            return pathToFileURL( this.#webkitRelativePath );
        }
    
    // For output, principally...
    toString()
        {
            return this.#webkitRelativePath;
        }
};