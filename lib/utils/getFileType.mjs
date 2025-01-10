import safeStatSync from "./safeStatSync.mjs";

export const 
FILETYPE_DIR = 'dir',
FILETYPE_FILE = 'file',
FILETYPE_LINK = 'link',
FILETYPE_PIPE = 'pipe',
FILETYPE_DEVICE = 'device',
FILETYPE_MISSING = '';


export default function 
getFileType( filenameOrStat )
    {
        const stat = typeof filenameOrStat === 'string' ? safeStatSync( filenameOrStat ) : filenameOrStat;
        if ( stat == null ) // Weak equals
            return FILETYPE_MISSING;
        else if ( stat.isDirectory() )
            return FILETYPE_DIR;
        else if ( stat.isFile() ) 
            return FILETYPE_FILE;
        else if ( stat.isFIFO() || stat.isSocket() )
            return FILETYPE_PIPE;
        else if ( stat.isSymbolLink() )
            return FILETYPE_LINK;
        else if ( stat.isBlockDevice() || stat.isCharacterDevice() )
            return FILETYPE_DEVICE;
        else
            throw new TypeError( "What the hell file type is it then?!" );
    }


