import http from 'node:http';
import {fileURLToPath } from 'node:url';
import {dirname,resolve as Path_resolve} from "node:path";
// crypto.randomUUID() only becomes fully public on v19 so we have to use the crypto version.
import {randomUUID} from "node:crypto"; 

import {ARG_POSITIONAL_VALUE, ARG_NAMED_VALUE,ARG_NAME,INFO_HASVALUE,INFO_NONE} from "../args/argtok.mjs";

import {getGlobalDefaults} from "../host/main.mjs";
import PackageTree,{getPackageJsonUrl} from "../host/PackageTree.mjs";
import Scriptlet from "../host/Scriptlet.mjs";

import FileSync from "../types/FileSync.mjs";

let abortPromise = null;
// Q: Does this want to be an abortSignal? The trouble is they have no promises!
// A: They have no promise mechanism. They need an event listener.
function 
createAbortPromise( ) {
    if ( !abortPromise ) {
        // Should we check it's a console? (Should this be in console?)
        process.stdin.setRawMode( true );
        abortPromise = new Promise( resolve => process.stdin.on('data',text => {
                         abortPromise = null;
                         console.log( "[abort]" );
                         resolve( 'abort' );
                     } ) );
    } 
    return abortPromise;
}
 
/// @brief Give the "path" part of a request, return the object
/// to use.
/// @param pathname <string> The leading '/' has been stripped.
async function
resolvePathname( webrootdir, packageTree, pathname ) {
    if ( pathname.startsWith( "/" ) )
        throw new TypeError( "Illegal path" );
    const [$0] = pathname.split( '/', 2 )
    if ( packageTree.has( $0 ) ) {
        if ( !packageTree.isWebSafe( $0 ) )
            throw new Error( "Forbidden" );
        // Q: Should we stick an `.isScriptlet` property to be compatible
        // with the horribleness below?
        return await packageTree.getScriptlet( $0 );
    }
    const f = FileSync.fromString( Path_resolve( webrootdir, pathname ), {} );
    if ( f.isFile ) 
        return f;
    if ( !f.isDirectory )
        return null;
    // We could have a well known scriptlet whose job is to generate indices. 
    const redirect = FileSync.fromString( Path_resolve( webrootdir, pathname, 'index.html' ), {} );
    if ( redirect.isFile )
        return redirect;
    return null;
}

function
*toOptions( pathname, searchParams ) {
    if ( pathname.startsWith( "/" ) )           
        throw new TypeError( "Illegal path" );
    /// FIXME: For `?some&thing=4`, `some` looks like a boolean and we should handle it as such.
    /// And URLSearchParams can't distinguish `?some=&thing` and `?some&thing` which are, for us,
    /// two completely different things.
    for ( const [key,value] of searchParams.entries() ) {
        // FIXME: we need to be able to pass in the key, and make it known this is the
        // key and not some mutated arg name.
        // 
        // Q: Do we need an option on how we translate key names to param names. 
        yield { type: ARG_NAME, value: `--${key}`, info: INFO_HASVALUE };
        yield { type: ARG_NAMED_VALUE, value, info: INFO_NONE };
    }
    for ( const value of pathname.split( '/' ) ) {
        yield { type: ARG_POSITIONAL_VALUE, value, info: INFO_NONE };
    }
}

async function
Scriptlet_webExec( scriptlet, pathname, searchParams, lexicalEnvironmentOptions = {} ) {
    const module = await scriptlet.importModule();
    const {idl} = scriptlet;
    const lexicalEnvironment = idl.createLexicalEnvironment( lexicalEnvironmentOptions );
    lexicalEnvironment.appendParsedOptions( idl.parseOptions( toOptions( pathname, searchParams ) ) );
    const _rawDictionary = lexicalEnvironment.finalise();
    const resolvedResult = await idl._exec1( module, _rawDictionary, );
    return resolvedResult;
}

async function
Scriptlet_isWebSafe( scriptlet  ) {
    // We have to do this here to guarantee `idl` is available.
    await scriptlet.importModule();
    return scriptlet.idl.getResultType().isScalar( 'JSON' ); 
}


async function 
cgi( pathname, scriptlet, searchParams, {remoteDiagnostics,sessionId,safeCall} ) {
    // Q: Should this not return an error, rather than throw?
    // A: No, it's an assertion check. A user-passed bad path should have 
    // already been spotted and handled before scriptlet resolution.
    if ( pathname.startsWith( "/" ) ) {
        throw new TypeError( "Illegal path" );
    }
    if ( !await Scriptlet_isWebSafe( scriptlet ) ) {
        return { code: 403, message: "Scriptlet doesn't output JSON" }
    }
    try {
        // This should be able to return buffes or blobs, and have them transmitted.
        // And URL should be a redirect.
        const result = await Scriptlet_webExec( scriptlet, pathname, searchParams, {globalDefaults:getGlobalDefaults({ sessionId})} );
        // const buffer = Buffer.from( JSON.stringify( result ) );
        // I'd return a Blob, but for the fact it looks horrible inefficient.
        return {
            mimeType: "application/json",
            content: JSON.stringify( safeCall? { success: true, value: result } : result ) 
        };
    } catch( err ) {
        // 2024_11_4: Why is this here? 
        if ( typeof err === 'object' && err && err.cause instanceof Error ) {
            err = err.cause;
        }
        if ( safeCall ) {
            // 2024_11_4:  Should we only be retrurning this if it has a casue?
            // i.e. is an error from the scriptlet itself.
            return {
                mimeType: "application/json",
                content: JSON.stringify( { success: false, value: remoteDiagnostics ? err.stack : err.message } ) 
            }; 
        } 
        console.error( err.message );
        let content = '';
        if ( remoteDiagnostics ) {
            content = err.stack;
        }
        return { code: 500, message: "Scriptlet exception", content  };
    }
}

function sanitiseMimeType( type ) {
    // 2024_9_23: I don't know where "application/module+javascript" came from or whether js-hell 
    // depends on it. (It might.) But browsers refuse it, and require at least "application/javascript" 
    // (although the standard now seems to say it should be "text/javascript"...) 
    if ( type === "application/module+javascript" )
        return "application/javascript";
    return type;
}

/// @brief 
/// @param pathname <string> The leading '/' has been stripped.
async function 
processRequest( packageTree, webrootdir, pathname, searchParams, {remoteDiagnostics=false,sessionId,safeCall} ) {
    let res;
    // This is horrible.
    try {
        // Should this return a `{ type, value }` pair?
        res = await resolvePathname( webrootdir, packageTree, pathname );
    } catch ( err ) {
        console.error( err.message );
        return { code: 500, message: "Path resolution", content: remoteDiagnostics ? err.stack : ''  };
    }
    if ( !res ) {
        return { code: 404, message: "Not found" };
    }
    if ( res instanceof Scriptlet ) {
        // fixme: block (or reject) if another scriptlet is running.
        return await cgi( pathname, res, searchParams, {remoteDiagnostics, sessionId,safeCall} );
    }
    if ( res.isFile ) {
        // FIXME: stream, don't load.
        const content = res.getContentAsBuffer();
        return {
            code: 200,
            content,
            mimeType: sanitiseMimeType( res.type )
        }
    }
    return { code: 403, message: "Forbidden" }
}

/// @brief A map-like object that proccesses the cookies. NB This only looks
/// for the uuid cookie - there is no point hanging onto whatever crap the 
/// user sends.
///
/// Q: should we validate the uuid here and dump it if not valid?
/// i.e. not store arbitary long data. 
class CookieJar {
    // #jar = new Map;
    #uuid;
    constructor( cookies ) {
        // RFC6265: 5.2.1 name-value pair is up to first ';'; the name is up to the first '=';
        // we should trim both.
        for ( const cookie of cookies.trim( ).split( /;\s*/g ) ) {
            if ( !cookie.includes( '=' ) ) 
                continue;
            const [key,value] = cookie.split( '=', 2 );
            if ( key.trimEnd() === "uuid" ) {
                this.#uuid = value;
            } 
            // this.#jar.set( key.trimEnd(), value );
        } 
    }
    static fromRequest( {cookie=''} ) {
        return new CookieJar( cookie );
    }
    get( name ) {
        return name === "uuid" ? this.#uuid : undefined;
        // return this.#jar.get( name );
    }
    has( name ) {
        return typeof this.#uuid !== 'undefined'; 
        // return this.#jar.has( name );
    }
}

/// @brief Check the cookie, and return the storage object we use.
/// Or, initialise a new storage object, and add a Set-Cookie header.
///
/// FIXME: Merge this with the above, so it gets the cookie header, and doesn't
/// prat around storing pointless data and creating objects that are never
/// otherwise used. 
function 
getSessionId( cookieJar, outgoingHeaders ) {
    let state;
    if ( cookieJar.has( 'uuid' ) ) {
        const uuid = cookieJar.get( 'uuid' ).trim();
        // NB We require a V4 UUID. This is important as The CLI doesn't use a V4
        // and so it's never possible to fake a CLI UUID. 
        if ( /^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-4[a-fA-F0-9]{3}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/.test( uuid ) ) 
            return {uuid,state:'='};
        // fallthrough.
        state = '!';
    } else {
        state = '+';
    }
    // Q: Is this (128-bits) too small? If you can guess a UUID you can hijack a session.
    // We could do `randomBytes(63).toString('base64')` which would give us 504 bits and
    // an 84 char string. Or even 57 byte for 456 bit/76-char base 64. 
    const uuid = randomUUID();
    // FIXME: the Max-Age should be configurable.
    outgoingHeaders['Set-Cookie'] = `uuid=${uuid}; Max-Age=${86400*7}; SameSite=Strict; Path=/`;
    return {uuid,state}
}

async function
getBody( response ) {
    let body = '';
    // Presumablty this will throw on error, which is fine.
    for await ( const buffer of response ) {
        body += `${buffer}`;
    }
    return body;
}

// 2024_11_13: I'd use util.MIMEType, but it's not present till 18.13 Aghhh... 
class MIMEType {
    #org;
    #essence;
    constructor( value ) {
        this.#org = value;
        value = value.trimStart();
        const [essence,params] = value.split( ';', 2 );
        this.#essence = essence.toLowerCase();
    }
    get essence() {
        return this.#essence;
    }
    toString() {
        return this.#org; 
    }
}

const HEADER_CONTENT_TYPE = "content-type";
// Why are these things always so messy?
async function
handleResponse( packageTree, webrootdir, incomingMessage, response, {remoteDiagnostics,safeCall} ) {
    const {method,headers,url:urlpath} = incomingMessage; 
    const cookieJar = CookieJar.fromRequest( headers );
    const outgoingHeaders = {};
    const {uuid:sessionId,state} = getSessionId( cookieJar, outgoingHeaders );
    let extraUrlSearchParams = null;
    if ( method === "POST" ) {
        if ( !Object.hasOwn( headers, HEADER_CONTENT_TYPE ) ) {
            console.log( "webhost[%s%s]: received %s (no content type) %s", state, sessionId, method, urlpath );
            response.writeHead( 400, "No Content-Type" );
            response.end();
            return;
        }
        const contentType = new MIMEType( headers[HEADER_CONTENT_TYPE] );
        console.log( "webhost[%s%s]: received %s (%s) %s", state, sessionId, method, contentType, urlpath );
        if ( contentType.essence !== "application/x-www-form-urlencoded" ) {
            response.writeHead( 500, "Post must be application/x-www-form-urlencoded" );
            response.end();
            return;
        }
        extraUrlSearchParams = new URLSearchParams( await getBody( incomingMessage ) );
    } else if ( method !== "GET" ) {
        console.log( "webhost[%s%s]: received %s %s", state, sessionId, method, urlpath );
        // FIXME: we are required to support "HEAD".
        response.writeHead( 501, "Unsupported method" );
        response.end();
        return;
    } else {
        console.log( "webhost[%s%s]: received %s %s", state, sessionId, method, urlpath );
    }
    /* As well as parsing the url into components, this prevents weird directory traversal 
       and path escape attacks; e.g. if a malicious client sends a malformed request
       where the path is  "../../../../etc/passwrd", this will turn that into 
       "https://dummyservername.internal/etc/passwd".
       and so the path we get out will be "/etc/password" (and we then drop the leading '/')
    */
    const url = new URL( urlpath, "https://dummyservername.internal" );
    const path = url.pathname.slice( 1 );
    
    let params = url.searchParams;
    // Q. Should we separated the posted content from the query string?
    // A. Why? We have no way to distinguish them.
    if ( extraUrlSearchParams ) {
        if ( params.size === 0 ) {
            params = extraUrlSearchParams;
        } else {
            // Q. Should we create a new `URLSearchParams` rather than ammending
            // the one in the url. 
            for ( const [key,value] of extraUrlSearchParams.entries() ) {
                params.append( key, value );
            }
        }
    }
    const res = await processRequest( packageTree, webrootdir, path, params, {remoteDiagnostics,sessionId,safeCall} );
    const { 
        code:statusCode = 200, 
        message:statusMessage = "OK" , 
        mimeType:contentType = "text/plain", 
        content = '' } = res;
    const buffer = Buffer.from( content );
    outgoingHeaders['Content-Type'] = contentType;   // cf HEADER_CONTENT_TYPE, but we want the canonical case; whereas we need it lc for the headers object. 
    outgoingHeaders['Content-Length'] = buffer.length; 
    response.writeHead( statusCode, statusMessage, outgoingHeaders );
    response.end( buffer );
}

export default async function 
main( {host = "127.0.0.1", port = 8111, cwd, remoteStacktrace:remoteDiagnostics = false,abortOnInput=true, usePackageJson = true,safeCall=false } = {} ) {
    const abort = abortOnInput && process.stdin.isTTY ? createAbortPromise() : new Promise( () => {} );
    console.warn( "This is EXPERIMENTAL. Do NOT deploy in a production environment." );
    const packageTree = new PackageTree( {builtins:false} );
    let webrootdir;
    if ( usePackageJson ) {
        const packageUrl = getPackageJsonUrl( `${cwd}` );
        if ( !packageUrl ) {
            throw new Error( "Couldn't find a `package.json` file" );
        }
        await packageTree.addJsonPackageFromUrl( packageUrl, { recurse: true } );
        if ( false && packageTree.packages().length === 0 )
            throw new Error( "No scriptlets" );
        // We definitely, for convenience, want this in packageTree
        webrootdir = dirname( fileURLToPath( packageUrl ) );
    } else {
        await packageTree.init();
        webrootdir = Path_resolve( `${cwd}` );
    }
    let close;
    console.info( "webhost:", webrootdir );
    console.info( "webhost: packages", packageTree.packages().map( n => n.name ) ); 
    // 2024_9_19: Yes, this is the demo code. I thought I'd start from scratch.
    const server = http.createServer((incomingMessage, response) => handleResponse( packageTree, webrootdir, incomingMessage, response, { remoteDiagnostics,safeCall} ) );
    /*server.on( 'clientError', (err, socket) => {
        if ( err.code === 'ECONNRESET' || !socket.writable ) {
            return;
        }
        socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    });*/
    server.listen({host,port}, ( ...args ) => {
        console.info( "webhost: listening on %s:%d", host, port, args );
    });
    // js-hell will close us unless we return a promise.
    await Promise.race( [ new Promise( r => close = r ), abort ] );
}


export const js_hell = `IDL=1
-- The experimental web host (xwh).
--
-- This serves a package:
--
--  * Ordinary files are returned as is (provided they match the files key.)
-- 
--  * js-hell scriptlets are executed as CGI.
--
--  See README.md for more info.
-- 
 HOST="0.0.0.0" PORT="8111"
 $0 
    [--remote-stacktrace]     -- Output exceptions, etc... to scripts.
    [--no-abort-on-input]     -- Don't listen on stdin and abort on any input.
    [--no-package-json]       -- Serve files from the current directory without any CGI.
    [--safe-call]             -- Use the safecall RPI format for all scriptlets. See docs. 
    [[HOST_STRING] PORT_INT]             
::
  default( {host:$1 = "127.0.0.1", port:$2 = 8111,cwd,remoteStacktrace,abortOnInput,usePackageJson:packageJson,safeCall} )` 
  

