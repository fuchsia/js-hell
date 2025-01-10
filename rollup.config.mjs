import PluginJson from "@rollup/plugin-json";
import {builtins} from "./lib/host/PackageTree.mjs";
import {fileURLToPath,pathToFileURL} from "node:url";
import * as path from "node:path";
import {readFileSync} from "node:fs";
import {minify_sync} from "terser";

export default {
    input: "lib/bin/cli.mjs",
    external: [ /^node:/, 'better-sqlite3' ],
    output: {
        file: "dist/js-hell.mjs",
        format: "es",
        inlineDynamicImports : true,
    },
    plugins: [ {
        name: "inline builtins",
        resolveId( source, importer ) {
            // Should we use import.meta.resolve( 'lib/host/builtins.json' )? Or catch every
            // builtins.json.
            if ( source !== "./builtins.json" ) 
                return;
            const id = fileURLToPath( new URL( source, pathToFileURL( importer ) ) );
            return {
                // We can't call it `id` because the JSON plugin handles it, even if we've
                // resolved the `id`.
                //
                // We can't exclude it, because don't fully know the path. (Although could
                // we exclude `**/builtins.json`? See above discussion
                // about absolute path.)
                //
                // Q: Should we just do all JSON resolving ourselves and ditch the json plugin?
                // A: What if it ends up being internal to rollup rather than relying on
                // a plugin? 
                id: path.join( path.dirname(id), crypto.randomUUID() ),
                external: false,
                meta: {
                    remapBuiltins: true,
                    filename: id 
                }
            }
        },
        load( id ) {
            if ( !this.getModuleInfo( id ).meta.remapBuiltins ) 
                return;
            return readFileSync( this.getModuleInfo( id ).meta.filename, 'utf8' ); 
        },
        transform( code, id ) {
            if ( !this.getModuleInfo( id ).meta.remapBuiltins ) 
                return;
            const filename = this.getModuleInfo( id ).meta.filename;
            let imports = ``;
            let json = ``;
            let m = 0;
            for ( const {nodetype,idl,url,version} of builtins() ) {
                const moduleUrl = url.toString();
                
                if ( !moduleUrl.startsWith( "about:" ) ) {
                    url.hash = "";
                    let importUrl;
                    if ( url.protocol !== 'node:' ) {
                        const p = fileURLToPath( url.toString() );
                        // Have I missed something? Is there no other way of doing this and
                        // gauaranteeing it will work?
                        // 
                        // NB, every path ends up `../xxx` (think about it) so we have to remove an initial '.', hence the `slice( 1 )`.
                        importUrl = path.relative( filename, p ).replaceAll( path.sep, '/' ).slice( 1 ); 
                    } else {
                        importUrl = url.toString();
                    }
                    imports += `import * as module\$${m} from ${JSON.stringify(importUrl)}\n`;
                    json += `   {nodetype:${JSON.stringify(nodetype )},idl:${JSON.stringify(idl)},moduleUrl:${JSON.stringify(moduleUrl)},module: module\$${m}, version: ${JSON.stringify( version )}},\n`;
                    ++m; 
                } else {
                    json += `   {nodetype:${JSON.stringify(nodetype )},idl:${JSON.stringify(idl)},moduleUrl:${JSON.stringify(moduleUrl )},module:undefined, version: ${JSON.stringify( version )}},\n`;
                }
            }
            const result = `${imports
            }const json = [\n${json 
            }];\nexport default json;\n`;
            return result;
        }
    }, {
        name: 'file-url-to-path',
        resolveId( source, importer ) {
            if ( !source.startsWith( "file:" ) )
                return;
            return fileURLToPath( source );
        }
    }, 
    new PluginJson(),
    // We might as well do it here. 
    {
        name: 'minify',
        renderChunk( code ) {
            // return code;
            const result = minify_sync( code, { module: true } ).code;
            console.log( "shrunk", result.length / code.length );
            return result;
        }
    }]
};

