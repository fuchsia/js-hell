import createFileListFromStringsAndFiles from "./FileList.mjs";
import getFileType,{FILETYPE_DIR,FILETYPE_MISSING,FILETYPE_FILE} from "../utils/getFileType.mjs";

import Dir from "./Dir.mjs";
import FileSync from "./FileSync.mjs";
import Integer from "./Integer.mjs";
import GlobPattern from "./GlobPattern.mjs";
import WebRequest from "./WebRequest.mjs";
import resolveScriptlet from "../host/resolve.mjs";

import { pathToFileURL } from 'node:url';
import {realiseTo} from "../consts.mjs";

export class 
TypeRegistration
{
    acceptsFileTopic;  //< boolean: if false, "-" is always "-"; if true it will be turned into a File.  

    constructor({
        name,
        aliases,
        super: _super,
        subname,
        fromString,
        is,                    // Should we have is? or should we throw/return undefined/null on fromString?
        writeable = false,
        literal = false,     // Why do we need this?
        enum: _enum = false, // Or this?
        variant = false,
        acceptsFileTopic = false,
        realiseStdioAs,
        realiseFileAs,
        createListFromStringsAndInstances,
        updateSubtype,
        updateVariant,
        // In C++ parlance these are namespace functions.
        casts = {},
        ...rest
    } ) {
        Object.assign( this, {
            name,
            aliases,
            super: _super,
            subname,
            fromString,
            is,
            literal,
            enum: _enum,
            writeable,
            realiseStdioAs, //< // 2024_8_13: This is probably now defunct.
            realiseFileAs,  //< 2024_12_1: This probably replaced the above. 
            variant,
            acceptsFileTopic,
            createListFromStringsAndInstances,
            updateSubtype,
            updateVariant,
            casts,
            // ...casts
        } );
        if ( Object.entries( rest ).length !== 0 )
            throw new TypeError( "Illegal keys in type registration" );
    }
};

const initialTypeList = [
    // FIXME: String has got to be canonical for casting.
    new TypeRegistration( {
        name: 'Str',
        aliases: [ 'String', 'Text', 'Name'],
        fromString( text ) { return text },
        is() { return true },
    } ),
    // An integer is virtually impossible as a positional... 
    // `--x=-4` is legal though
    new TypeRegistration( {
        name: 'Int',
        aliases: 'Integer',
        fromString( text ) { return Integer.fromString( text ); },
        is( text ) { return /^[-+]?\d+$/.test( text ) },
    } ),
    /*
        df --help:
        SIZE may be (or may be an integer optionally followed by) one of following:
        kB 1000, K 1024, MB 1000*1000, M 1024*1024, and so on for G, T, P, E, Z, Y.
    */
    new TypeRegistration( {
        name: 'Count',
        aliases: undefined,
        // FIXME: should this be Unsigned_integer with Int as our super?
        // UnsignedInteger with Int as a our super?
        fromString( text ) { return Integer.fromString( text ); },
        is( text ) { return /^\d+$/.test( text ) },
    } ),  
    new TypeRegistration({
        name: 'Date',
        aliases: undefined,
        fromString( text ) { 
            const datevalue = Date.parse( text );
            if ( !Number.isFinite( datevalue ) )
                throw new TypeError( "Invalid date" );
            return new Date( datevalue );
        },
        /* Is this used anymore?*/
        casts: {
            Date_fromNumber( msSinceEpoch ) { return new Date( msSinceEpoch ) }
            ,Date_toMillisecondsSinceEpoch( date ) { return +date }
            ,Date_toNumber( date ) { return +date }
        }
    } ),
    new TypeRegistration( {
        name: 'File',
        // FIXME: this needs cwd.
        fromString( filename, { cwd = "." } = {} )
            {
                // And junkPathnames?
                return new FileSync( filename, cwd );
            },
        // Should we vet for illegal characters?
        is( filename ) { return true },
        realiseStdioAs: 'Stream',
        writeable: true,
        acceptsFileTopic: true,
        createListFromStringsAndInstances( strings, dictionary ) {
            // This is all backwards. The extensions are really mime types. Although, in some situations we may not be able
            // to work out the mimetype. But when a user says PNG_FILE they are realyy specifying a file of type `image/png`
            // and that's what we should be tracking. We can alway synethesise unknowns as application/x-ext
            return createFileListFromStringsAndFiles( strings, { extensions: this.extensions ?? '', ...dictionary });
        },
        updateSubtype( o, subtypeName )
            {
                o.extensions = `.${subtypeName.toLowerCase()}`;
            },
        updateVariant( o, types )
            {
                o.extensions = types.map( t => t.extensions ).filter( text => text !== '' );
            }
    } ),
    new TypeRegistration( {
        name: '(Dir|File)',
        aliases: undefined,
        acceptsFileTopic: true,
        fromString( name, { cwd = "." } = {} )
            {
                // FIXME: this has just called stat. Pass it on to file|dir.
                const fileType = getFileType( name );
                if ( fileType === FILETYPE_FILE )
                    return new FileSync( name, { cwd } );
                if ( fileType === FILETYPE_DIR )
                    return new Dir( name );
                // FIXME: this is recoverable in some situations - provided we don't realise and only access members
                // that are in common.
                // depends on what happens. e.g. accessing `name` 
                if ( fileType === FILETYPE_MISSING  )
                    throw new TypeError( `${JSON.stringify(name )} must exist` );
                throw new TypeError( `${JSON.stringify(name )} is a special file` ); 
            },
        createListFromStringsAndInstances( strings, dictionary ) {
            return createFileListFromStringsAndFiles( strings, { ...dictionary , extensions: '',  dirs: true, files: true });
        },
        variant: true,
    } ),
    // Name is a string type but it conveys semantic informatioin. e.g. TopicName, FileName etc...
    new TypeRegistration( {
            name: 'Dir',
            fromString( dirname, {cwd = "." } )
                {
                    return new Dir( dirname, cwd );
                },
            // Should we vet for illegal characters? E.g. '*'
    } ),
    new TypeRegistration( {
            name: 'DirName',
            aliases: 'Dirname',
            fromString( dirname, {cwd = "." } )
                {
                    const result = new Dir( dirname, cwd );
                    result[realiseTo] = 'Filename';
                    // FIXME: --cwd=DIRNAME and everybody assumes DIRNAME is a string
                    // with no scope for realisation since it's internal code.
                    return result.toFilename();
                    return result;
                },
            // Should we vet for illegal characters? E.g. '*'
    } ),
    // get-projectdir uses File_name and it needs it to be the exact name.
    // (or does it?)
    new TypeRegistration( {
            name: 'FileName',
            aliases: 'Filename',
            fromString( filename, { cwd = "." } = {} )
                {
                    // Should Filename include directories?
                    const result = new FileSync( filename, cwd );
                    result[realiseTo] = 'Filename';
                    return result;
                },
    } ),
    new TypeRegistration( {
            name: 'Url',
            fromString( url, {cwd} )
                {
                    // FIXME: we should supply the cwd plus some path as the base url...
                    let baseUrl;
                    if ( typeof cwd !== 'undefined'  ) {
                        baseUrl = pathToFileURL( `${cwd}` ) + "/url_algorithm_deletes_this";
                    }
                    const u = new URL( url, baseUrl );
                    return u;
                },
            // FIXME: replace with flying monkeys.
            // `fetch($1).text()` is almost as simple as `$1 to Text` and also makes it clear
            // we are fetching it. The only missing one is `buffer()` and we could monkey patch
            // or magic it in; e.g. a helper `%Response.prototype.buffer()`
            // The below would be `%URL.toText()`
            casts: {
                ULR_toBuffer: async url => Buffer.from( await ( await fetch( url ) ).arrayBuffer() ),
                URL_toResponse: async url => fetch( url ),
                URL_toArrayBuffer: async url => ( await fetch( url ) ).arrayBuffer(),  
                // 2022_10_11: 
                // Q: Should this be String?
                // A: The argument is `url to String` means give us the url as a string;
                // `url to Text` means give us the content. It all looks dubious, though.
                //
                // So this goes further. Should be a Response or something, not an URL type.
                URL_toText: async url => ( await fetch( url ) ).text(),
                    
                URL_toJson: async url => ( await fetch( url ) ).json(),
            }
            // Should we vet for illegal characters? E.g. '*'
    } ),
    new TypeRegistration( {
        name: '(File|Url)',
        acceptsFileTopic: true,
        fromString( name, { cwd = "." } = {} )
            {
                // 2022_9_3: As of node 18.6, fetcth() can't handle fiel urls, it would appear.
                // Once it can, we will do this:
                //
                // FIXME: PNG_FILE|URL should clearly add an accept header and then validate the content type.
                // This means we will need mime types. 
                const isUrl = /(?<=^[a-zA-Z]{2,}):/.test( name );
                const result = isUrl ? new WebRequest( name ) : FileSync.fromString( name, { cwd  });
                // If you are writing `FILE|URL` you seem to be categorically wanting the content, therefore
                // we realise as Buffer. But that's not intuitive.  
                //
                // Q: Should we dynamically realise based on mim-type = text/* being realise string; json as json;
                // everything else as Buffer. 
                result[realiseTo] = 'Buffer';
                return result; 
            },
        createListFromStringsAndInstances( strings, dictionary ) {
            // 2022_9_3: 
            // Urls are async, which  means iterator, e.g `findstr example *.mjs http://example.com` are getting
            // promises back.
            //
            // Also, we would have to start racing iterators, rather than processing them sequentially.
            throw new Type( "Lists of url|file not implemented." ); 
            return createFileListFromStringsAndFiles( strings, { ...dictionary , extensions: '',  dirs: true, files: true });
        },
        variant: true,
    } ),
    new TypeRegistration( {
        name: 'Json', // Has to be this. Should we special case it (along with URL?)
        fromString( text ) { try {
            return JSON.parse( text ); 
        } catch( err ) {
            console.log( text );
            throw err;
        }},
        is( text ) {
            // This looks horribly broken. In theory, it should allow us to build an JsonFile|Json variant
            // automatically. But that seems risky. 
            const trimmedText = text.trim();
            if ( /^[\[{"'0-9-]/.test( trimmedText ) )
                return true;
            if ( trimmedText === "true" || trimmedText === "false" || trimmedText === "null" )
                return true;
            return false; 
        },
        // This means the file topic can be be passed in as FileSync
        acceptsFileTopic: true,
        // This means we can magically accept files (at the moment file topic)
        // and they will be realised as JSON.
        realiseFileAs: 'JSON',
    } ),
    new TypeRegistration( {
        // Q: Why `File` and not `JsonFile`?
        // A: We parse any file as Json. Also it's shorter.
        //
        // FIXME: This should support URL (i.e. Json|File|Url) as well, but there's no RequestSync
        // type and no magic to do async realisation.  
        name: '(File|Json)',
        fromString( text, { cwd = "." } ) {
            // `12`, `true`, and event `{}` are ambigious: they could be json or
            // they could be file names. We introduce the following rule:
            // if it begins `[` or `{` we assume parse it as JSON, otherwise
            // we treat is as a file.  
            if (  text.startsWith( "{" ) || text.startsWith( "[" ) ) {
                try {
                    return JSON.parse( text ); 
                } catch( err ) {
                    console.log( text );
                    throw err;
                }
            } else {
                // Originally the intent was to do `JSON.parse(JSON.stringify(file))` and rely on file's `toJSON()` 
                // method. But FileSync defaults to realising as a buffer, so that's what `JSON.stringify()` is 
                // passed. So we ask for it to be realised as JSON. Which makes the whole process magically work.
                // (Except when we are passed the FileTopic - but that's handled by deep magic below.)
                //
                // Q: Should we realise it as JSON ourselves, here? (Leave aside the file topic params.)
                const f = new FileSync( text, cwd );
                f[realiseTo] = 'JSON';
                return f;
            }
        },
        is( text ) {
            return true; 
        },
        // This means the file topic can be be passed in as FileSync
        acceptsFileTopic: true,
        // This means we can magically accept the file topic and it will be realised as JSON.
        // Q: Should this be extended to all files? So the `Json` type could accept files.
        realiseFileAs: 'JSON',
    } ),
    // The type FILE takes a filename, not a literal file. So SCRIPTLET is fine to be a SCRIPTLET_NAME
    // not a SCRIPTLET.
    new TypeRegistration( {
        name: 'Scriptlet',
        
        fromString( name, { cwd = "." } = {} ) {
                // `cwd` is likely a `Dir` - hence `toString()`
                // We return a promise, but there are enough waits that that should be good.
                return resolveScriptlet( name, {cwd: cwd.toString()} );
            },
        // Should we vet for illegal characters?
        is( name ) { return true },
        writeable: false,
    } ),
    // We can't put the constructor in here (a) because of name but (b) because of how we subclass types.
    ...Object.entries( { Glob: GlobPattern } ).map( ([key,constructor]) => new TypeRegistration({
        name: key,
        fromString: constructor.fromString,
        writeable: typeof constructor.prototype.setValueAsBuffer === 'function'
        /*constructor*/
    } )) 
// Q: Should we store names as all lower case? Or all uppercase?
];

const types = new Map( initialTypeList.map( T => [ T.name, T ] ) );

// 2022_10_10:  Needs to be done before buildAliases, to avoid dudplication. 
export const 
casts = (function () {
        const casts = {};
        for ( const desc of types.values() ) {
            if ( typeof desc.casts === 'undefined' ) 
                continue;
            for ( const [name,callback] of Object.entries( desc.casts ) )
                casts[name] = callback;
        }
        return casts;
    })();

(function 
buildAliases() {
        const aliases = [];
        for ( const desc of types.values() ) {
            if ( !desc.aliases ) {
                desc.aliases = [];
            } else if ( !Array.isArray( desc.aliases ) ) {
                desc.aliases = [desc.aliases];
            }
            
            for ( const alias of desc.aliases ) {
                aliases.push( [alias,desc] );
            }
        }
        for ( const [name,value] of aliases )
            types.set( name, value );
    })();

export default types;
    
/// @brief The types builtin command. 
export function list() {
    const result = [];
    for ( const {name,aliases=[]} of initialTypeList ) {
        // FIXME: there ought to be a formatter for this
        result.push( [name,...aliases].join( ' ' ) );
    }
    return result; 
}



