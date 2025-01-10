import PackageTree,{SOURCE_BUILTIN} from "./PackageTree.mjs";
import {resolve as Path_resolve} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";

// 2024_4_12: The faster these become true scriptlets, the better.
async function 
fromNode( treeNode ) {
    const {name,idlText,moduleUrl}  = typeof treeNode.toScriptlet === 'function' ? await treeNode.toScriptlet() : treeNode.value;;
    const res = {
        name,
        // 2024_12_30: ScriptletCatalogue generate scriptlets can't define this
        // (well, maybe in some cases they could. But they don't try.) 
        url: typeof moduleUrl !== 'undefined' ? moduleUrl.toString() : undefined,
        idl: idlText 
    };
    return res;
}

describe( "the package tree should", () => {
    it( "resolve where an imported child package exports multiple scriptlets [PKT-MULTI]", async () => {
        const tree = new PackageTree;
        await tree.addCwdPackageTree( "./test-data/dummy-package-with-multi-export-child" );
        const packages = await Promise.all( 
                            Array.from( tree.packages() )
                            .filter( node => node.source !== SOURCE_BUILTIN )
                            .map( fromNode ) 
                        ); 
        
        // console.log( packages );
        expect( packages ).toEqual(
            /*[
                { 
                    name: "child",
                    url: pathToFileURL( Path_resolve( "./test-data/dummy-package-with-multi-export-child/node_modules/child/main.mjs" ) ) + "#wibble",
                    idl: "IDL=1 wibble :: wibble()"
                },
                { 
                    name: "wobble",
                    url: pathToFileURL( Path_resolve( "./test-data/dummy-package-with-multi-export-child/node_modules/child/main.mjs" ) ) + "#wobble",
                    idl: "IDL=1 wobble :: wobble()"
                }  
            ]*/
            [{
                name: "child",
                url: undefined,
                idl: "IDL=1 $0 (wibble|wobble) :: default( $1, $2 )"
            }]
        );
        
    } );
    it( "handle missing dependencies", async () => {
        const tree = new PackageTree;
        await tree.addCwdPackageTree( "./test-data/dummy-package-with-missing-dependency" );
        const packages = await Promise.all( 
                            Array.from( tree.packages() )
                            .filter( node => node.source !== SOURCE_BUILTIN )
                            .map( fromNode ) 
                        ); 
        
        expect( packages ).toEqual([]);
        
    } );
} );
