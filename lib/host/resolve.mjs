import {basename as Path_basename,join as Path_join} from "node:path";
import { pathToFileURL} from 'node:url';
import json_q from "../utils/json_q.mjs";
import getFileType,{FILETYPE_DIR,FILETYPE_FILE,FILETYPE_MISSING} from "../utils/getFileType.mjs";
import Scriptlet,{PACKAGE_KEY_JS_HELL,PACKAGE_KEY_JS_HELL_LEGACY} from "./Scriptlet.mjs";
import PackageTree from "./PackageTree.mjs";
import ScriptletCatalogue from "./ScriptletCatalogue.mjs"; 

const DEFINITION_JSON_URL = 'json_url',
      DEFINITION_SCRIPT_URL = 'script_url';
                
export {PACKAGE_KEY_JS_HELL,PACKAGE_KEY_JS_HELL_LEGACY};

function
getPackageOrModule( filename )
{
    // Q: Should we return error types rather than throw? Most of these
    // are predictable error conditions rather than genuine errors. 
    const filetype = getFileType( filename );
    if ( filetype === FILETYPE_DIR ) { 
        const packageFile = Path_join( filename, 'package.json' ); 
        if ( getFileType( packageFile ) !== FILETYPE_FILE )
            throw new Error( `missing ${packageFile}` );
        return {
            type: DEFINITION_JSON_URL,
            filename: packageFile,
        };
    } else if ( filetype === FILETYPE_MISSING ) {
        throw new Error( json_q`no FILE ${filename}` );
    } else if ( filetype !== FILETYPE_FILE ) {
        throw new Error( json_q`cannot read ${filename}` );
    } else if ( filename.endsWith( ".mjs" ) || filename.endsWith( ".js" ) ) {
        // console.assert( moduleName === path.basename( scripletName, ".mjs" ) );
        return {
            type: DEFINITION_SCRIPT_URL,
            filename,
        }
    } else if ( filename.endsWith( ".json" ) ) {
        // console.assert( moduleName === path.basename( scripletName, ".json" ) );
        return {
            type: DEFINITION_JSON_URL,
            filename
        }
    } else {
        throw new Error( json_q`cannot process file ${filename}` );
    }
}
 

/// @brief This handles the case of an `.mjs` file. 
async function
Scriptlet_fromEsmModule( url, shim )
{
    url = `${url}`;
    const module = await import( url );
    if ( Object.hasOwn( module, 'js_hell' ) ) {
        // FIXME: this should be an error if `shim` is defined, shouldn't it?
        // Or should it always override?
        // There may be some modules with a number in here...
        if ( typeof module.js_hell !== 'number' ) {
            return Scriptlet.from( module.js_hell, url, module );
        }
        console.error( "invalid module (numeric js_hell key)", url ); 
    }
    // FIXME: what counts as a shim?  
    if ( shim ) 
        return Scriptlet.from( shim, url, module );
    throw new TypeError( `Incompatible module (missing or invalid "js_hell" export in module ${JSON.stringify( url )})` );
}
async function
Scriptlet_fromFile( scriptletName, shim ) {
    const {type,filename} = getPackageOrModule( scriptletName );
    const url = pathToFileURL( filename );
    if ( type === DEFINITION_SCRIPT_URL ) {
        return Scriptlet_fromEsmModule( url, shim );
    } else if ( type === DEFINITION_JSON_URL ) {
        // The reason this is here is because the default packageTree hasn't been created.
        // In some cases, this is as short circuit.
        const packageTree = new PackageTree;
        await packageTree.addJsonPackageFromUrl( url, { recurse: false } );
        return packageTree.getCompositeRootScriptlet( shim, { url, name:Path_basename(scriptletName )});
    } else {
        throw new Error( json_q`Unknown file type ${type}` );
    }
}

async function
Scriplet_fromUrl( url, shim )
{
    // FIXME: we need to fetch() this and look at the mimetype
    // to see if it is json - and then handle appropriately.
    // irritating we can't do that with `import()`
    // (Or should we do a with/non-with import() and try?)
    return Scriptlet_fromEsmModule( url, shim );
}

const RE_URL_PREFIXES = /^(?:https?|file):/,
      RE_FILE_PREFIXES = /^(?:\.?[/\\]|[A-Za-z]:)/,
      RE_SOFT_FILE = /[.\\/]/;

const CS_FILE = 'file',
      CS_URL = 'url',
      CS_FILE_OR_PACKAGE = 'file-or-package',
      CS_PACKAGE = 'package';

function
classifyScriptlet( scriptletName )
{
    if ( RE_URL_PREFIXES.test( scriptletName ) ) {
        return CS_URL;
    }
    if ( RE_FILE_PREFIXES.test( scriptletName ) ) {
        return CS_FILE;
    }
    return !scriptletName.startsWith( '@' ) && RE_SOFT_FILE.test( scriptletName ) ? CS_FILE_OR_PACKAGE : CS_PACKAGE;
}

/// @brief Turn a "name" that a user might type at the comamnd-line into a scriplet.
///
/// @param scriptletName This defaults to help for the case where there are no
///                      arguments supplied.
/// @param cwd           Execute in this directory.
///
/// FIXME: shim should default to '*'.      
async function 
_resolveScriptlet( scriptletName = "help", { shim = '', cwd = undefined } )
    {
        const type = classifyScriptlet( scriptletName );
        if ( type === CS_FILE ) 
            return Scriptlet_fromFile( scriptletName, shim );
        if ( type === CS_URL )
            return Scriplet_fromUrl( scriptletName, shim ); 
        
        const packageTree = new PackageTree;
        await packageTree.addCwdPackageTree( cwd );
        /** H1, H2 - manual alias. If we add these as aliases in the packagetree, then they
        are listed in help - which we don't want. (Should/could help spot aliased packages?)
        
        FIXME: this has just thrown away the packageTree.
        */
        if ( scriptletName === "--help" || scriptletName === "-h" ) 
            scriptletName = "help";
        if ( packageTree.has( scriptletName ) )
            return packageTree.getScriptlet( scriptletName, shim ); // NB this throws if we have a shim.
        if ( type === CS_FILE_OR_PACKAGE )
            return Scriptlet_fromFile( scriptletName, shim );
        if ( type !== CS_PACKAGE )
            throw new TypeError( json_q`Unknown package type ${type}` );
        
        // Everybody else throws errors; e.g. `no such file`
        throw new Error( json_q`no PACKAGE ${scriptletName}` );
    }

// 2024_4_12: FIXME: shim should defaul to '*', I think.
export async function 
resolveScriptlet( scriptletName, { shim, cwd } = {} ) 
{
    const scriptlet = await _resolveScriptlet( scriptletName, { shim, cwd } );
    // The above is only a partial resolution - it's not unreasonable
    // to ensure the module is loaded and any errors have been generated
    // before we return.
    await scriptlet.importModule();
    return scriptlet;
}  
export {resolveScriptlet as default};
