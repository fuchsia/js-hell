import * as path from "node:path";
import * as fs from "node:fs";
import { pathToFileURL, fileURLToPath } from 'node:url';
// 2024_10_15: Prior to ?18 we can only find Blob by importing node:buffer.
import {Blob} from "node:buffer";

class Dirent {
    fullPath;

    constructor( name )
        {
            this.fullPath = path.resolve( name );
        }
        
    // Would we be better off with a filesystemEntry  - that could contain the full path, too.
    // Or, at least, a link to the FileSync that created us - and let that do the work;
    // not least the missing call to lastModified.
    async getFile( n )
        {
            const name = path.resolve( this.fullPath, "..", n );
            const buffer = fs.readFileSync( name );
            return new File( [buffer], name, { fileSystemEntry: new Dirent( name ) } ); 
        }
    
    getFileFromRelativeURL( url )
        {
            return getFile( fileURLToPath( new URL( url, pathToFileURL( this.fullPath ) + "/." ) ) ); 
        }
    
    /// @brief 
    /// 
    /// @param relativeUrl An url referenced in this FilesystemEntry, e.g. the entry for a  script or a stylesheet.
    /// @param relativeTo The FileSystemEntry the path is to be relative to. e.g. the root HTML document.    
    relativePathFromUrl( relativeUrl, relativeTo = this )
        {
            // URL will remove the final element of this, if necessary.
            const baseUrl = pathToFileURL( this.fullPath );
            const fullPath = fileURLToPath( new URL( relativeUrl, baseUrl  ) );
            // FIXME: the .. is only needed if the relativeTo is a file.
            return path.relative( path.resolve( relativeTo.fullPath, ".." ), fullPath ); 
        }                                                         

    async getParent()
        {
            return new Dirent( path.join( this.fullPath, ".." ) );
        }

    toURL()
        {
            return pathToFileURL( this.fullPath );
        }
};

// 2024_4_23: No longer needed.
// 2024_10_15: Except for backwards compatibility. (File appears 20.0) 
export default class
File extends Blob 
{    
    name;    
    lastModified;    
    webkitRelativePath;
    fileSystemEntry;
    // FIXME: default the lastModified and type from the fileSystemEntry, somehow. getMeta()?    
    constructor( bits, name, {type='',lastModified= Date.now(),fileSystemEntry = new Dirent( name ) } = {} )        
    {            
        super( bits, { type } );            
        Object.assign( this, {                
            name: path.basename( name ),                
            lastModified,                
            webkitRelativePath: name,
            fileSystemEntry                
            } );        
    }
};