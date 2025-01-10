import {resolve as Path_resolve, relative as Path_relative, join as Path_join, sep as Path_sep, parse as Path_parse} from "node:path";
import {readdirSync} from "node:fs";
import getFileType,{FILETYPE_DIR,FILETYPE_MISSING} from "./utils/getFileType.mjs";

// findstr glob`--recurse *.mjs *.js`
// findstr jso`["file1.txt","file2.txt"]`
// findstr [file1.txt file2.txt]
// repeat; findstr [file1.txt file2.txt]; while; until;
// if (cond) {something}   
  
function 
isGlob( globText )
    {
        return globText.indexOf( '*' ) !== -1;
    }

function 
sortOut( filespec, cwd, recurse, defaultGlob )
    {
        if ( filespec === "" ) 
            throw new TypeError( 'Invalid filespec`""' );
        if ( !isGlob( filespec ) ) {
            filespec = Path_resolve( cwd, filespec );
            //const spec = Path_resolve( cwd, filespec );
            let filetype = getFileType( filespec );
            if ( filetype === FILETYPE_MISSING )
                return null;
            if ( ( typeof recurse === 'undefined' || recurse ) 
                && filetype === FILETYPE_DIR ) 
            {
                return { 
                    globDir: filespec,
                    globs: Array.isArray( defaultGlob  ) ? defaultGlob : [ defaultGlob ], 
                    recurse: true,
                    filespec: '',
                }
            } else {
                return { 
                    globDir: '',
                    globs: null, 
                    recurse: false,
                    filespec,
                }
            }
        } else {
            const {dir,base} = Path_parse( filespec );
            // This could be missing; in which cas ewe are a null.
            let globDir;
            if ( isGlob( dir ) ) {
                const r = Path_parse( dir );
                if ( isGlob( r.dir ) || r.base !== '**' )
                    throw new TypeError( "Unsupported glob" ) 
                if ( recurse === false )
                    throw new TypeError( "Cannot use a recursive glob with --no-recurse" );
                recurse = true;
                globDir = Path_resolve( cwd, r.dir ) || cwd;
            } else {
                recurse = !!recurse;
                globDir = Path_resolve( cwd, dir ) || cwd;
            }
            const type = getFileType( globDir );
            // Should this be an error?
            if ( type !== FILETYPE_DIR )
                throw new TypeError( `${JSON.stringify( globDir )} is not a directory` );
            return {
                globDir,
                globs: [ base ],
                recurse,
                filespec: ''
            }
        }
    }

function
Map_arrayOrStringAndJoin( arrayOrString, callback, join = '', prefix = '', suffix = '' )
    {
        if ( !Array.isArray( arrayOrString ) )
            return callback( arrayOrString, 0 );
        return prefix + arrayOrString.map( callback ).join( join ) + suffix;
    }

function 
createRegexAlternateFromGlob( text )
    {
         // NB we exclude '*' because we want it!
        return text
                .replaceAll( /[.+?|^$\[\](){}\\]/g, $1 => '\\' + $1 )
                //.replaceAll( '*', '[^\\\\/]*?' ); 
                .replaceAll( '*', '.*?' ); 
    }

export function 
toRegExp( globs )
    {
        if ( globs.indexOf( '**' ) !== -1 )
            throw new TypeError( "Cannot convert a recursive glob to a RegExp" );
        // FIXME: recursive globs.
        // FIXME: *.x an *.y and ... should be merged  to `.*\.(?:)` and it's a common enough case.
        const globsAsRegex = Map_arrayOrStringAndJoin( globs, createRegexAlternateFromGlob, '|', '(?:', ')' );
        return new RegExp( `^${globsAsRegex}$` );
    }


/// @param cwd Patterns like `'**/*'` can't be handled by Path_xxx so we have to do path resolution.
///
/// Q: Should we yield relative paths?
///
/// @param recurse
///
// Examples `dir dir` and `dir -Cpath dir` should they begin "dir\..."
// Also `dir dir1 dir2`    
export default function*
glob( singleOrMultipleFilespecs, { recurse, cwd=".", glob: defaultGlob="*", exclude = "", return: { dirs: returnDirs = false } = {} } = {} )
    {
        debugger;
        cwd = `${cwd}`;
        const filespecs = Array.isArray( singleOrMultipleFilespecs ) ? singleOrMultipleFilespecs : [singleOrMultipleFilespecs];  
        let nonGlobs = [];
        const searches = new Map;
        for ( const f of filespecs ) {
            const res = sortOut( f, cwd, recurse, defaultGlob );
            if ( !res )
                continue;
            if ( !res.globs ) {
                // We return everything relative to the cwd, which makes sense, I think.
                // FIXME: dir handling.
                // FIXME: dir checks and suffix Path_sep
                nonGlobs.push( Path_relative( cwd, Path_resolve( cwd, res.filespec ) ) );
                continue;
            }
            const globDir = res.globDir; 
            if ( searches.has( globDir ) ) {
                const r = searches.get( globDir )
                if ( r.recurse !== res.recurse )
                    throw new TypeError( "Confused recurse params" );
                r.globs.push( ...res.globs );
            } else {
                searches.set( globDir, {
                    globs: res.globs,
                    recurse: res.recurse,
                } )
            }
        }
        // The filtering out is annoying.
        if ( nonGlobs.length )
            yield* nonGlobs;
        
        // FIXME: this doesn't spot nested directories.
        for ( const [dir,{recurse,globs}] of searches.entries() ) {
            const globRegex = toRegExp( globs ),
                  // FIXME: if the glob is .* we shouldn't allow exclude.
                  excludeRegex = exclude ? toRegExp( exclude ) : !globRegex.source.startsWith( "^\\." ) ? toRegExp( ".*" ) : null;
            const dirs = [{dir,recurse}];
            for ( let i = 0; i < dirs.length; ++i ) {
                const {dir,recurse} = dirs[i];
                // If we are recursice, list the dir immediately prior to any
                // files in that dir.
                if ( recurse && returnDirs && i )
                    yield Path_relative( cwd, dir ) + Path_sep;
                for ( const f of readdirSync( dir, {withFileTypes:true} ) ) {
                    // Q: Should we exclude directories, too? 
                    // (This is used in the tests.)
                    if ( excludeRegex && excludeRegex.test( f.name ) )
                        continue;
                    const filename = Path_join( dir, f.name );
                    // If recursive we can add to the list...
                    if ( f.isDirectory() ) {
                        if ( recurse === true  ) { 
                            // What if the directory matches the name?
                            dirs.push( {dir:filename, recurse} );
                        } else if ( returnDirs ) {
                            yield Path_relative( cwd, filename ) + Path_sep;
                        }
                    } else {
                        if ( globRegex.test( f.name ) ) {
                            // Q: Consider `make-archive --cwd=dir my.ar ../*.png`
                            //
                            // Anyway, we relativise. I think it makes sense.
                            //
                            // OTOH, we are given 
                            //
                            yield Path_relative( cwd, filename );
                        }
                    }
                }
                // If we wanted the dir on exit (e.g. pruning empty directories?)
                // we could add it here.  
            }
        }
    }