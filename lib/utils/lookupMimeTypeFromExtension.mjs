import types from "./mimetype-extensions.json" with { type: "json" };

const UNKNOWN = "";
/// @param `extname` The extension, including the leading '.'; i.e. as returned via `path.extname()`
export default function
lookupMimeTypeFromExtension( extname ) 
    {
        // Q: should this be windows only? 
        extname = extname.toLowerCase();
        // NB the insistence in adding a '.' here means adding 1k to the file size.
        if ( Object.hasOwn( types, extname ) )
            return types[ extname ];
        return UNKNOWN;
    }
    