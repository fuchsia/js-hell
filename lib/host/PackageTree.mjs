/*
    TODO: the package tree should use only contain scriptlets. We can always wrap
    the function. Remove all the silly nodes. (But scriptlet might need a type.)
*/
import * as path from "node:path";
import { pathToFileURL, fileURLToPath } from 'node:url';
import { readFileSync } from "node:fs";
import getProjectDir from "./getProjectdir.mjs";
import Scriptlet,{PACKAGE_KEY_JS_HELL,PACKAGE_KEY_JS_HELL_LEGACY} from "./Scriptlet.mjs";
import ScriptletCatalogue from "./ScriptletCatalogue.mjs";
import json_q from "../utils/json_q.mjs";

import * as JsHell from "./builtins/js-hell.mjs"; 


// We could lazily `fetch()` this, but do a hard import for rollup, etc...
// Because if rollup fails to include the linked scripts, there names will
// at least be reserved.  
import builtinsPackageList from "./builtins.json" with { type: 'json' };
const BUILTINS_URL = new URL( './builtins.json', import.meta.url );
// We give them all js-hell's version. Could it from the above?
import {default as jsHellPackage} from "../../package.json" with { type: "json" };
import CommandLineScript from "./CommandLineScript.mjs";
const DEBUG = false;

/// @brief An alias for the root package. If we publicallly reserve this, it means the
/// root package is available under this name.
export const ROOT_PACKAGE = "root-package";  
                                        
function 
safeKeys( object ) {
    return Object.keys( typeof object === 'object' && object ? object : {} );
}

function 
safeEntries( object ) {
    return Object.entries( typeof object === 'object' && object ? object : {} );
}

async function 
fetchJson( url ) {
    try {
        // 2024_10_15: Another backwards? compatibility hack. Probably faster, too.
        // OTOH we multiply fetch and don't cachce. This might allow better diagnosis
        // of error (see next comment).
        if ( ( new URL( url ) ).protocol === "file:" ) {
            return JSON.parse( readFileSync( fileURLToPath( url ), 'utf8' ) );
        }
        // We should probably use fetch here---or even file ops---so we can properly diagnose 
        // errors; e.g. a json file that is invalid JSON vs once that doesn't exist at all.
        return ( await import( url, { with: { type: 'json' }} ) ).default
    } catch ( err ) {
        // JSON can never be `undefined`, so this is categorically not JSON.
        return undefined;
    }
}

// 2024_3_21: Should this be the function we export and not the keys.
function
getPackageJsonKey( packageJson ) {
    const hasLegacy = Object.hasOwn( packageJson, PACKAGE_KEY_JS_HELL_LEGACY ),
          hasCorrect = Object.hasOwn( packageJson, PACKAGE_KEY_JS_HELL );
    if ( hasCorrect ) {
        if ( hasLegacy )
            throw new TypeError( `package cannot have both ${PACKAGE_KEY_JS_HELL} and ${PACKAGE_KEY_JS_HELL_LEGACY} keys` );
        return PACKAGE_KEY_JS_HELL;
    } else if ( hasLegacy ) {
        return PACKAGE_KEY_JS_HELL_LEGACY;
    }
    return '';
} 

export function 
getPackageJsonUrl( cwd ) {
    
    // FIXME: we want getProjectDir to return the path including `package.json`.
    const projectdir = getProjectDir( 'package.json', cwd, { relative: false } );
    if ( !projectdir ) 
        return "";
     return pathToFileURL( path.join( projectdir, 'package.json' ) );
}

function 
getCwdPackageTreeUrl( cwd = "." ) {
    return getPackageJsonUrl( cwd );
}

function
getPackageMainModuleUrl( packageJson, packageJsonUrl ) {
    if ( typeof packageJson.main !== 'string' )
        return null;
    return new URL( packageJson.main, packageJsonUrl  );
}


function
getRunnableScript( scriptText ) {
    // FIXME: We migth as well start tokenisation and skip that stage.
    const PREFIX = "js-hell ";
    const t = `${scriptText}`.trimStart(); 
    if ( t.startsWith( PREFIX ) ) {
        return t; // t.slice( PREFIX.length ).trimStart();
    } else {
        return "";
    }
}


// A string should be legal here. Should we convert it to `{idl:json}` though?
function 
getPackageJshellDescriptor( json ) {
    return typeof json[PACKAGE_KEY_JS_HELL] === 'object' ? json[PACKAGE_KEY_JS_HELL] 
          : typeof json[PACKAGE_KEY_JS_HELL_LEGACY] === 'object' ? json[PACKAGE_KEY_JS_HELL_LEGACY] : null;
}
 
function
IDL_isStar( idl ) {
    if ( Array.isArray( idl ) ) {
        idl = idl.join( '\n' );
    }
    if ( typeof idl !== 'string' )
        return false;
    idl = idl.trim();
    return idl === '*';
}
function
IDL_isNested( idl ) {
    return typeof idl === 'object' && idl && !Array.isArray( idl );
}

const 
URLTYPE_ROOT          = 'root',             //< The "url" is the package name of the outer package.json.
URLTYPE_MODULE        = 'module',           //< A relative or absolute url to a module to load.
URLTYPE_IGNORE        = 'ignore',           //< A comment.         
URLTYPE_NODE_MODULE   = 'node:dep',         //< Does `import("node:<module>")` i.e. a node builtin. 
URLTYPE_CHILD_PACKAGE = 'child-package',    //< A dependendent package.  
URLTYPE_MISSING_DEP   = 'nodep',            //
URLTYPE_NESTED        = 'nested';           //< Not returned by toFullUrl, but by toPackageEntries to indicate a sublet catalogue.

// For `URL_MODULE` When you do `"#x":` it's mapped onto `${EMPTY_URL_PROTOCOL}${EMPTY_URL_PATH}`
// See https://github.com/whatwg/html/issues/6911 for the blankjs proposal. It makes sense. We don't want any js.
const
BLANKMODULE_URL_PROTOCOL = "about:",
BLANKMODULE_URL_PATH = "blankjs",
BLANKMODULE_URL = `${BLANKMODULE_URL_PROTOCOL}${BLANKMODULE_URL_PATH}`;  

const
NODETYPE_ROOT          = URLTYPE_ROOT,             // Either `package.json/js-hell` wasn't a scriptlet list, or it includes a ref to the package main.
NODETYPE_MODULE        = URLTYPE_MODULE,           // Key in scriptlet list was a direct module.
NODETYPE_NODE_MODULE   = URLTYPE_NODE_MODULE,      // Key in scriptlet imported `node:*` 
//NODETYPE_CHILD_PACKAGE = 'child-package',    // Never stored, I think.  
NODETYPE_SCRIPT        = 'script',           // This came from `package.json/scripts` (i.e. is `npm run`) and doesn't use js-hell; i.e. we can' run it.
NODETYPE_JSHELL_SCRIPT = 'js-hell script',   // An `npm run` that calls js-hell and which we wrap. 
NODETYPE_SHIM          = 'shim',             // The IDL was specified in a scriptlet list, but the key is the package name of a dependency or dev dependecy. 
                                             // NB we currently block shims from override a package's own IDL.
NODETYPE_CATALOGUE = 'catalogue';            // An actual instance of ScriptletCatalogue; 

export {NODETYPE_SCRIPT};
export const
SOURCE_BUILTIN = 'js-hell:builtin'; // Should be `about:builtins`? rather than creating our own?

      
function 
nonOverwritingAdd( map, key, value ) {
    if ( !map.has( key ) )
        map.set( key, value );
}

/// @brief Used for entries in `package.json/scripts` which are not js-hell runnables.
class 
InformationalNode {
    name;
    type;
    baseUrl;
    value;
    source;   //< string|URL: The URL of the package.json where we were declared.
    
    constructor({name,type,baseUrl,value,source})
    {
        Object.assign( this, {name,type,baseUrl,value,source});
    }
    isRunnable() {
        return false;
    }
    toScriptlet() {
        throw new TypeError( "Not runnable!" );
    }
};

class 
ScriptletNode {
    name;          //< defaults to scritplet.name; should this be a getter for that?
    type;          
    baseUrl;       //< ?? - defaults to scritplet.moduleUrl; should this be a getter for that.
    value;         //< Scriptlet    
    source;        //< string|URL: The URL of the package.json where we were declared.
    
    constructor( scriptlet, { name = scriptlet.name, baseUrl = scriptlet.moduleUrl, type = NODETYPE_MODULE, source  } = {} ) {
        // FIXME: we might as well receive the value if we are going to do it like this. Or even have the builtins as BuiltinNodes.
        Object.assign( this, {name, type, value: scriptlet, source });
    }
    isRunnable() {
        return true;
    }
    toScriptlet() {
        return this.value; 
    }
};

/// @brief A package listed under dependencies or devDependecies which may or may not have a shim supplied.
class 
DependencyNode {
    #packageJsonUrl;  //< The url of the `package.json`
    #packageJson;     //< The parsed json object.
    //#module;        //< The main module of the package.
    #moduleUrl;
    // #shim; // Was created via shims and this is the shim.
    name;
    type;
    baseUrl;
    value;             //< The idl to use. Should never be '*'.
    source;            //< string|URL: The URL of the package.json where we were declared.
    
    constructor({name,type,baseUrl,value,source}) {
        Object.assign( this, {name,type,value,source});
        this.#packageJsonUrl = baseUrl; 
    }

    /*static fromRoot( json, url, packageTree ) {
        const node = new DependencyNode( { name: json.name, type: NODETYPE_ROOT, baseUrl: url, value: getPackageJshellDescriptor( json ) }, packageTree );
        node.#packageJsonUrl = url; 
        node.#packageJson = json;
        // FIXME: dedup with below: 
        node.#moduleUrl = getPackageMainModuleUrl( json, url );
        return node;
    }*/

    // FIXME: this is a private method.
    async resolveJson() {
        if ( typeof this.#packageJson !== 'undefined' )
            return;
        const json = await fetchJson( this.#packageJsonUrl );
        if ( json.name !== this.name )
            throw new TypeError( "Package name doesn't match name under which it was loaded" );
        
        this.#moduleUrl = getPackageMainModuleUrl( json, this.#packageJsonUrl );  
        if ( !this.#moduleUrl )
            throw new TypeError( json_q`Package ${this.name} is not executable (missing or invalid "main" key in package.json)` ); 
        if ( this.type === NODETYPE_SHIM ) {
            const descriptor = getPackageJshellDescriptor( json );
            if ( descriptor )
                throw new TypeError( json_q`Package ${this.name} cannot be overridden with a shim as it has a js-hell descriptor` );
        } else {
            this.value = getPackageJshellDescriptor( json );
        } 
        this.#packageJson = json;
    }
    

    async isRunnable() {
        try {
            await this.resolveJson();
            // Q: Should we do more detailed checks than this: 
            // like checking the module exists and the IDL is valid.
            // A: Wouldn't it be useful to flag packages that we can 
            // locate but which we won't run because they are invalid?
            //
            // In fact, depdencies we can't find are worth mentioning. 
            return !!this.value;
        } catch ( err ) {
            DEBUG && console.error( err );
            // NB if this fails, then `this.#packageJson` won't have be set
            // and so toScriptlet() should call it again and generate the erors.
            return false;
        }
    }
    
    async toScriptlet() {
        // Why does it do this?
        await this.resolveJson();

        return new Scriptlet( this.value, { module: /*this.#module*/undefined, moduleUrl: this.#moduleUrl } )
    }

};

// Should this be part of main - for glorious, recursive linking.
function 
wrapScriptIntoScriptlet( scriptName, scriptText, packageUrl ) {
    const startupDir = path.dirname( fileURLToPath( packageUrl ) );
    return new CommandLineScript( scriptText, { startupDir } ).toScriptlet( scriptName );
}


const malformed = new Set;

const KEY_ROOT_PACKAGE = Symbol( ROOT_PACKAGE );
/// @brief Take the package.json and return the "scriptlet dictionary". (The scriptlet dictionary is, essentially
/// the js-hell key in the package: an object whose keys are import specifiers and whose values
/// are the IDL or '*'.)
///
function 
getScriptletDictionary( packageJson, recurse = false, diagnostic_packageJsonUrl ) {
    const result = {};
    if ( typeof packageJson !== 'object' || Array.isArray( packageJson ) ) {
        if ( !malformed.has( diagnostic_packageJsonUrl ) ) {
            console.warn( "warning: missing or malformed package list %s", diagnostic_packageJsonUrl );
            // 2024_7_15: help rebuilds the package tree (Ugh). So we end up issuing two warnings.
            // One is sufficient.
            malformed.add( diagnostic_packageJsonUrl );
        } 
        return result;
    }
    const jshellKey = getPackageJsonKey( packageJson ); // NB This returns '' if no mathcing key.
    if ( jshellKey ) {
        const jshellValue = packageJson[jshellKey];
        
        if ( typeof jshellValue === 'object' ) {
            if ( jshellValue === null )
                throw new TypeError( `invalid ${jshellKey} entry in package.json: null` );
            if ( !Array.isArray( jshellValue ) )
                return jshellValue;
        }
        const packageName = packageJson.name;
        if ( typeof packageName === 'string'  ) {
            result[packageName] = jshellValue;
            result[KEY_ROOT_PACKAGE] = packageName; 
        } else {
            // Could we reaonably guess the name from the jsonUrl - i.e. the directory?
            throw new TypeError( `if idl is used ${jshellKey} the package must have a name` );
        }  
    }
    if ( recurse ) {
        // 2025_1_12: `optionalDepenendices`, `peerDependnecies`?
        for ( const dep of safeKeys( packageJson.dependencies ) ) {
            if ( !Object.hasOwn( result, dep ) ) 
                result[dep] = '*';
        }
        
        for ( const dep of safeKeys( packageJson.devDependencies ) ) {
            if ( !Object.hasOwn( result, dep ) ) 
                result[dep] = '*';
        }
    }
    return result;
}

// keep an eye on `resolve.mjs/Scriptlet_fromFile` for similariities.
async function 
addChildPackages( packageTree, url, { recurse = false } ) {
    const urlString = url.toString(),
          packageJson = await fetchJson( urlString ),
          nestedPackageList = getScriptletDictionary( packageJson, recurse, urlString );
    await packageTree.addScriptletList( nestedPackageList, url, packageJson );
    
    // 2024_10_15: NB `packageJSON` is returned as `undefined` when the import failed.
    // The functions above warn and cope. Hence the need for another test with `?.`.
    //
    // Q: Should we add the warning in `fetchJson()` and then check afterwards and abort
    // if it's undefined?
    if ( recurse && packageJson?.scripts ) 
        packageTree.addScriptNodes( packageJson.scripts, url ); 
}

function
hasOwn( object, key ) {
    /* Soft equals */
    if ( object == null ) 
        return false;
    return Object.hasOwn( object, key );
}

function
sanitiseUrl( url ) {
    if ( typeof url.protocol !== 'file:' )
        return url;
    // No fragments, no searches, etc...
    return new URL( url.pathname, 'file:' );
}


function
toFullUrl( urlOrName, packageJson, packageJsonUrl ) {
    // Q: Is there any reason we should exclude 'http:', 'https:', 'file:' urls?
    // `resolveScriptlet()` considers all these as urls, along with `about:`
    // Q: Should we treat these as files and do `pathToFileURL()`?
    // A: If there is a good reason, then "yes". But these are LHS of a JSON object and
    // builtin exploits them being urls to use './file.mjs#x'. URLS are also 
    // consistent. So currently "no".
    // Q: Is there an argument for allowing `./file.mjs#exportedName` to create a magic module
    // with exportedName as the default? This would show us much more clearly what is going on
    // in the LHS - although NB it breaks the file.mjs#x trick where a function is used mutliple times.
    // But, as numbers aren't legal function names, we could probably make that work.
    // FIXME: if we are going to use relative urls we should check for directory
    // traversal (i.e. ban '..' path components). 
    if ( urlOrName.startsWith( './' ) ) {
        const url = new URL( urlOrName, packageJsonUrl );
        sanitiseUrl( url ); 
        return { type: URLTYPE_MODULE, url, name: undefined };
    }
    if ( urlOrName.startsWith( 'node:' ) ) {
        return { type: URLTYPE_NODE_MODULE, url: new URL( urlOrName ), name: undefined };
    }
    if ( urlOrName.startsWith( "#" ) ) {
        // See https://github.com/whatwg/html/issues/6911 for the blankjs proposal. It makes sense.
        // Do we need a separate type for this URLTYPE_BLANK?
        return { type: URLTYPE_MODULE, url: new URL( urlOrName, BLANKMODULE_URL ), name: undefined };
    }
    if ( urlOrName.startsWith( "about:" ) ) {
        const url = new URL( urlOrName );
        // See https://github.com/whatwg/html/issues/6911 for the blankjs proposal. It makes sense. We don't want any js.
        if ( url.pathname === "blankjs" ) {
            // If this fails, we should be converting it to the actual BLANKMODULE_URL
            console.assert( BLANKMODULE_URL === "about:blankjs", "The code is broken: it assumes `about:blankjs` is BLANKMODULE_URL" );
            return { type: URLTYPE_MODULE, url: url, name: undefined };
        }
        // FIXME: there's nothing else we support here. So this is an error.
        // 
        // Proposal to support `about:config#value` and take it out the loop; e.g. 
        // `{ "about:config#project-database" : "./some-file" }` 
        // `{ "about:config#option" : true }` 
        // `{ "about:config" : { "option": true, "project-database": "./some-file" }`? 
    }
    if ( urlOrName.startsWith( '--' ) ) {
        return { type: URLTYPE_IGNORE, url: urlOrName, name: undefined }; 
    }
    if ( urlOrName === packageJson.name ) {
        // 2024_9_28: This is the only case that returns name! And we can clearly deduce it!
        return { type: URLTYPE_ROOT, url: getPackageMainModuleUrl( packageJson, packageJsonUrl ), name: urlOrName };
    }
    // 2025_1_12: FIXME: we need to check for optionalDependencies, peerDependencies, etc... But for now
    // it has to be in the dev or main depenendencies.
    if ( hasOwn( packageJson.dependencies, urlOrName ) || hasOwn( packageJson.devDependencies, urlOrName ) ) {
        const dependencyName = urlOrName,
              dependencyPackageUrl = new URL( `./node_modules/${dependencyName}/package.json`, packageJsonUrl ); 
        // FIXME: surely this should return `name:dependencyName`? `toPackageEntries()`
        // has to return key, especially for this.
        return { type: URLTYPE_CHILD_PACKAGE, url: dependencyPackageUrl, name: undefined  };
    }
    return { type: URLTYPE_MISSING_DEP, url: urlOrName, name: undefined };
}

function
isBlankModuleUrl( {protocol,pathname} ) {
    return protocol === BLANKMODULE_URL_PROTOCOL && pathname === BLANKMODULE_URL_PATH; 
}

// Exported for the rollup plugin of builtins.mjs
export function 
*toPackageEntries( packageList, packageJsonUrl, packageJson ) {
    for ( const [urlOrName,idl] of Object.entries( packageList ) ) {
        // This can throw. `let` because of rewriting of type for URLTYPE_NESTED.
        let {type,url,name} = toFullUrl( urlOrName, packageJson, packageJsonUrl );
        // Should toFullUrl being spotting dependencies? If so should we be there or here?
        // (It currently can't be there because it depends on the idl.)
        if ( type === URLTYPE_MODULE && isBlankModuleUrl(url) && IDL_isNested( idl ) ) {
            type = URLTYPE_NESTED;
            // We're trying to get rid of name. But in this case it makes sense: 
            // the downstream consumer shouldn' thave to understand the syntax we're adopted:
            // it just wants to know the name to build them under.
            name = url.hash.slice( 1 );
        } 
        // Q: Should we join Arrays here; e.g. `"key": [ "*" ]` seems valid but will kill us because
        // nobody can spot it. (But cf. `IDL_isStar`; still it would be simplified if we handled it here.)
        // Q: We have various reserved names in the builtins. Should default this behaviour to `null`?
        //
        // Q: Instead of throwing should we issue a warning and mark the node as a comment
        // (or in error?) 
        else if ( typeof idl !== 'string' && !Array.isArray( idl ) ) {
            throw new Error( json_q`Invalid IDL for entry ${urlOrName}: it must be a string` );
        }
        yield {type,url,name,idl,key:urlOrName};
    }
}

export function 
*builtins() {
    const {version} = jsHellPackage;
    for ( const {type,url,idl} of toPackageEntries( builtinsPackageList, BUILTINS_URL, jsHellPackage ) ) {
        // We might need to support URLTYPE_NODE_MODULE eventually.
        if ( type === URLTYPE_MODULE || type === URLTYPE_NODE_MODULE ) {
            yield { nodetype: type, idl, url, version  };
        } else if ( type !== URLTYPE_IGNORE ) {
            throw new TypeError( json_q`Unsupproted URLTYPE ${type}` );
        }
    } 
}

async function
ScriptletNodes_from( scriptletList, packageJsonUrl, packageJson ) {
    // Should source be called `packageJsonUrl`, with BUILTINT as "js-hell:builtin" or something?
    const source = packageJsonUrl;
    if ( packageJsonUrl === SOURCE_BUILTIN )  
        packageJsonUrl = BUILTINS_URL; 
    const {version} = packageJson;
    
    const nodes = [];
    // 1. The `idl` is a minsonmer, it's just the value of the key-value entries pair.   
    // 2. `name` is only used fro URLTYPE_ROOT, everything else is expected to deduce the external
    // name from the url (which is what scriptlet does). Q: Is this correct: should we not set
    // the external name ourselves? We certainly would benefit from having it available.
    for ( const {type,url,name,idl,key} of toPackageEntries( scriptletList, packageJsonUrl, packageJson ) ) {
        if ( type === URLTYPE_IGNORE ) {
            continue;
        } else if ( type === URLTYPE_NESTED ) {
            const subnodes = await ScriptletNodes_from( idl, packageJsonUrl, packageJson );
            if ( subnodes.length === 0 )
                throw new Error( json_q`No sub commands for ${url}` );
            // FIXME: DependencyNode types are the only one which is async, surely
            // this case can be done away with here? i.e. this should only be SUBLETS
            const scriptlets = await Promise.all( subnodes.map( n => n.toScriptlet() ) )
            nodes.push( await ScriptletCatalogue.fromScriptlets( scriptlets, { name, source } ) );
        } else if ( type === URLTYPE_MISSING_DEP ) {
            // FIXME: these should be added as error scriptlet which throw on run
            // and which help can flag - e.g. in red.
            console.error( "missing dependency: %s", url, packageJsonUrl );
        } else if ( type === URLTYPE_CHILD_PACKAGE ) {
            console.assert( typeof name === 'undefined', "name shouldn't be defined here" );
            if ( IDL_isStar( idl  ) ) { 
                // Unfortunately, we have to do this synchronously because of the priorities.
                // FIXME: every entry could asynchronosuly generate a pacakge list, and then 
                // we could merge them in one final step.
                
                // FIXME: defer this package creation till toScriptlet() is called.
                const childPackageTree = new PackageTree;
                await childPackageTree.addJsonPackageFromUrl( url, { recurse: false } );
                // FIXME: how should we handle the singular case of a singular  dependency?
                // e.g if the imported child is:
                // `{"js-hell": { "#script": "IDL=1 $0 :: with () 'me!'"}}`
                
                if ( childPackageTree.hasTrueRootScriptlet() ) {
                    const scriptlet = await childPackageTree.getTrueRootScriptlet();
                    nodes.push( new ScriptletNode( scriptlet, { type, source }  ) ); 
                } else if ( childPackageTree.getOwnScriptletEntries( url ).length ) {
                    // ScritpletCatalogues conform to the `PackageTree::Node` interface.
                    nodes.push( ScriptletCatalogue.fromPackageTree( childPackageTree, {url, name:key} ) ); 
                }
            // A catalogue is going to look like a child dependency:
            } else if ( IDL_isNested( idl ) ) {
                // FIXME: see above discussion above error scriptlet.
                console.error( "%s: nested IDL not supported here", key );
                
            } else {
                // We defer loading the json until we need it.
                //
                // FIXME: this is the blocker on getting rid of magic nodes 
                // and having the tree comprised entirely of true `Scriptlet` objects.
                // 
                // The obvious solution is to supply a function which lazily imports.
                // But we want to be able to see the url we will ultimately use - 
                // don't we?
                // 
                // Can we adjust the spec so moduleUrl is `async`? Is that too much pain?
                // N.B. scripts have this problem too - it's just we don't care.
                // 
                // Can scriptlet.importModule() be allowed to rewrite the url? So after
                // importing the module, you have the true url()? (We still have the problem
                // of how to do that.)
                nodes.push( new DependencyNode({ name: key, type: NODETYPE_SHIM, baseUrl: url, value: idl, source } ) );
                
            }
        } else if ( type === URLTYPE_ROOT ) {
            const scriptlet = new Scriptlet( idl, { moduleUrl: url, name, version } );
            const rootNode = new ScriptletNode( scriptlet, { type: NODETYPE_ROOT, source } )
            nodes.push( rootNode );
            // FIXME: there ought to be a stock type for this.
            // (Possibly just a symbolic alias?)
            const aliasedNode = Object.create( rootNode, Object.getOwnPropertyDescriptors( { 
                name: ROOT_PACKAGE,
                isRunnable() { return Object.getPrototypeOf( this ).isRunnable() },  
                toScriptlet() { return Object.getPrototypeOf( this ).toScriptlet() }               
            } ) );
            nodes.push( aliasedNode ); 
        } else if ( type === URLTYPE_NODE_MODULE ) {
            // 2024_12_31: Q: Do we actually need to be checking this? We were
            // trying to leave validating the IDL to the IDL class so couldn't
            // we leave it till then?
            //
            // The aim is we do it lazily, but `help` forces a load and validation
            // of all modules and reporting of errors.
            if ( IDL_isStar( idl ) ) {
                // FIXME: see above discussion above error scriptlet.
                console.error( "%s: cannot use '*' as the IDL", key );
                continue;
            }
            if ( IDL_isNested( idl ) ) {
                // FIXME: see above discussion above error scriptlet.
                console.error( "%s: cannot use a nested IDL key for a `node:` module", key );
                continue;
            } 
            const scriptlet = new Scriptlet( idl, { moduleUrl: url, version } );
            nodes.push( new ScriptletNode( scriptlet, { type, source } ) );
            
        } else if ( type === URLTYPE_MODULE ) {
             if ( IDL_isNested( idl ) ) {
                 // FIXME: see above discussion above error scriptlet.
                console.error( "%s: nested IDL not supported here", key );
             } else {
                const scriptlet = new Scriptlet( idl, { moduleUrl: url, version } );
                nodes.push( new ScriptletNode( scriptlet, { type, source } ) );
             } 
        } else {
            throw new Error( json_q`Unknown node type \`${type}\`` );
        }
    }
    return nodes;
}

export default class 
PackageTree
{
    // Most of these are wrappers round scriptlets. 
    //
    // There are some unrunnable place-holders, too, which could be handled by
    // Scriptlet. But we'd need to add a type hint to scriptlet so help can tell
    // what's what. 
    #packageMap;
    #includeBuiltins; //< bool: Disabled by the webhost, for obvious security reasons.
                      // While it makes the `isWebSafe()` check, there are plenty of
                      // subversions; e.g. `js-hell json somefile` and if the scripts
                      // aren't here they can't be subverted.

    constructor( {builtins = true} = {} ) {
        this.#includeBuiltins = builtins;
    }
    
    async init() {
        if ( this.#packageMap )
            return;
        this.#packageMap = new Map;
        if ( !this.#includeBuiltins ) 
            return;
        // 2024_9_30: rollup hacks `builtin.json` so it contains all the scripts and the 
        // information about them.
        // 
        // FIXME: we can't have two code paths. The whole point was that builtins are just an 
        // ordinary scriptlet list. And it means errors could appear in rollup which have no
        // tests.
        //  
        if ( Array.isArray( builtinsPackageList ) ) {
            for ( const {nodetype,idl,moduleUrl,module,version} of builtinsPackageList ) {
                this.addScriptlet( nodetype, new Scriptlet( idl, {moduleUrl,module,version}), SOURCE_BUILTIN );
            }
        } else {
            await this.addScriptletList( builtinsPackageList, SOURCE_BUILTIN, jsHellPackage );
        }
        // 2024_11_25: This manually adds `js-hell` as builtin, converting it from `js-hell`
        // to `js-hell ...` We do it like this because we don't want `...` on general release.
        // ( We could have had it in builtins.json, but this makes everything simpler and allows us to
        // enable it on a flag.)
        //
        // In reality, js-hell has two syntax options. 1) `js-hell TEXT` and
        // 2) `js-hell SCRIPTLET ...` and we don't know which until we have pulled multiple args.
        
        const scriptlet = new Scriptlet( JsHell.js_hell, {module:JsHell,name:'js-hell'}); 
        scriptlet.idl.addTail(); // This does lots of sanity checking.
        this.addScriptlet( NODETYPE_MODULE, scriptlet, SOURCE_BUILTIN ); 
        
    }
    
    async addJsonPackageFromUrl ( url, { recurse = false } ) {
        if ( !url )
            throw new Error( "No package url" );
        await this.init();
        await addChildPackages( this, url, { recurse } );
    }

    async addCwdPackageTree( cwd = '.' ) {
        cwd = `${cwd}`; // webhost passes us a dir object; easiest to fix here, since it defaults.
                        // (That dir probably should have been realised, anyway. )
        const url = getCwdPackageTreeUrl( cwd );
        if ( url ) {
            await this.addJsonPackageFromUrl( url, { recurse: true } );
        } else {
            await this.init();
        }
    }

    has( packageName ) {
        return this.#packageMap.has( packageName );
    }

    /// @brief Used by xwh to determine if we should run it.
    isWebSafe( packageName ) {
        const node = this.#packageMap.get( packageName );
        if ( ( node.type === NODETYPE_MODULE || type === NODETYPE_SHIM ) && node.source !== SOURCE_BUILTIN )
            return true;
        console.log( "not websafe?", node.type, node.source );
        return false; 
    }

    static isNonShim( shim ) {
        // FIXME: it should always be '*' - this needs fixing in resolve.
        return shim == null || shim !== '' || shim !== '*';
    }

    async getScriptlet( packageName, shim ) {
        if ( !PackageTree.isNonShim( shim ) )
            throw new TypeError( "No shims!" );
        const node = this.#packageMap.get( packageName );
        // NB toScriptlet is async because of lazy resolving - that's why we are async.
        // Should we enforce a separate resolve call?
        return node.toScriptlet();
    }

    // 2024_12_30: This pre-dates `getCompositeRootScritplet()`
    hasTrueRootScriptlet() {
        return this.#packageMap.has( ROOT_PACKAGE );
            
    }
    // 2024_12_30: This pre-dates `getCompositeRootScritplet()`
    /*async*/ getTrueRootScriptlet( shim ) {
        return this.getScriptlet( ROOT_PACKAGE, shim );
    }
    
    // FIXME: this shouldn't need url and name as an argument. Are they not somewhere in here?
    // Used by `resolve()` Internally, we make different decisions.
    getCompositeRootScriptlet( shim, { url, name} = {} ) {
        if ( this.hasTrueRootScriptlet() ) {
            return this.getTrueRootScriptlet( shim );
        } else {
            if ( !PackageTree.isNonShim( shim ) )
                throw new TypeError( "No shims!" );
            return ScriptletCatalogue.fromPackageTree( this, {url, name} ).toScriptlet();            
        }
    }

    
    /// @brief 
    /// @param packageJsonUrl All paths are relative to this.
    ///
    /// @param packageJson - this is used when there are implied modules, rather than paths; we search 
    ///                      the `name` `dependencies` and `devDependencies`
    async addScriptletList( scriptletList, packageJsonUrl, packageJson = {} ) {
        const nodes = await ScriptletNodes_from( scriptletList, packageJsonUrl, packageJson ) ;
        const packageMap = this.#packageMap;
        for ( const node of nodes ) {
            nonOverwritingAdd( packageMap, node.name, node );
        }
    }

    addScriptNodes( scripts, baseUrl ) {
        const packageMap = this.#packageMap;
        for ( const [scriptName,scriptText] of safeEntries( scripts ) ) {
            const scriptArgv = getRunnableScript( scriptText );
            if ( scriptArgv ) {
                // FIXME: make this call addScriptlet
                nonOverwritingAdd( packageMap, scriptName, new ScriptletNode( wrapScriptIntoScriptlet( scriptName, scriptArgv, baseUrl ), { type: NODETYPE_JSHELL_SCRIPT }, this ) );
            } else {
                nonOverwritingAdd( packageMap, scriptName, new InformationalNode({ name: scriptName, type: NODETYPE_SCRIPT, baseUrl, value: {scriptText}}, this) );
            }
        }
    }
    
    addScriptlet( type, scriptlet, source ) {
        const node = new ScriptletNode( scriptlet, { type, source }, this );
        nonOverwritingAdd( this.#packageMap, node.name, node );
        // Returned so we can alias it for the root-package; aghhh!!
        return node;
    }

    packages() {
        // * This hides aliases - e.g. without special hacking, a `root-package` entry would appear 
        // as the package name and not as `root-package`.
        // * `root-package` can be null, so needs to be filtered out ( irritatingly ).
        return Array.from( this.#packageMap.values() ).filter( n => !!n ); 
    }
    
    
    /// @brief this _ought_ be the list of scritplets defined explicitly in the `js-hell {}` key of the package.
    /// It won't return builtins. The rest is a bit hit and miss.
    ///
    /// @return <string name,Scriptlet>[]   
    getOwnScriptletEntries( url ) {
        url = url.toString();
        return Array.from( this.#packageMap.values() ).flatMap(  
            node => {
                if ( !node )
                    return [];
                // 2025_1_7: Is there any reason we should exclude these now, as long as they were
                // explicitly defined in the js-hell key?
                if ( node.type !== NODETYPE_MODULE && node.type !== NODETYPE_CATALOGUE) 
                    return [];    
                // 2024_12_11:  Yes, the source can be an URL (almost always is) not a string. Discuss.
                // The purpose of this is to remove builtins. Should we really remove anything else?
                // Define
                if ( node.source.toString() !== url ) 
                    return [];
                return [[node.name, node.value]];
            } 
        ); 

    }

};




