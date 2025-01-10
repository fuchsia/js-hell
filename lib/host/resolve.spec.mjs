import resolveScriptlet from "./resolve.mjs";
import {resolve as Path_resolve} from "node:path";
import {fileURLToPath} from "node:url";
import StartsWith from "../utils/StartsWith.mjs";
import Scriptlet,{ERROR_NAME_MISMATCH} from "./Scriptlet.mjs";
/* Arguably some of these are tests of the PackageTree itself, not the resolver. */

const API_VERSION = 1;

// Yes, this is actually an url object.
const URL_HELP = new URL( "./help.mjs", import.meta.url );

describe( "resolveScriptlet should", () => {
    it( "resolve a textual 'js-hell' export with embedded api", async () => { 
        const scriptlet = await resolveScriptlet( "./test-data/resolver-api-in-idl.mjs" );
        expect( scriptlet.idlText ).toEqual( "IDL=1 resolver-api-in-idl :: default()" );
        // expect( await scriptlet.importModule() ).toEqual( await import("../../test-data/resolver-api-in-idl.mjs") );
    } );
    it( "NOT resolve a package without a js_hell key", async () => {
        // Should this be a TypeError? 
        await expectAsync( resolveScriptlet( "./test-data/empty.mjs" ) ).toBeRejectedWithError( TypeError, /^Incompatible module/ );
    } );
    // 2024_3_19: This is no longer the resolvers problem. It has a js_hell key, that's more than enough.
    xit( "NOT resolve when the API version is missing in the IDL.", async () => {
        await expectAsync( resolveScriptlet( "./test-data/resolver-no-api-in-idl.mjs" ) ).toBeRejectedWithError( TypeError, "No API version supplied" );
    } );
    it( "--help should resolve to builtin:help [H2]", async () => {
        const scriptlet = await resolveScriptlet( "--help" );
        // Do we actually want these returning URL objects?
        expect( scriptlet.moduleUrl ).toEqual( URL_HELP );
    } );
    it( "-h should resolve to builtin:help [H1]", async () => {
        const scriptlet = await resolveScriptlet( "-h" );
        // Do we actually want these returning URL objects?
        expect( scriptlet.moduleUrl ).toEqual( URL_HELP );
    } );
    describe( "resolve when the js-hell key ", () => {
        // 2024_3_26: Q: are these really tests of getPackageList()?
        // A: that would have failed to pick up on a Scriptlet conversion error that this spotted.
        it( "is an array [RES4]", async () => {
            
            const result = await resolveScriptlet( "./test-data/dummy-package-array-idl" );
            expect( result.moduleUrl ).toEqual( new URL( "../../test-data/dummy-package-array-idl/main.mjs", import.meta.url ) );
            expect( result.idl.toString() ).toEqual(
            [ 
                "IDL=1",
                "dummy-package -- Does nowt!",
                ":: default()" ].join( '\n' ) 
            ); 
        } );
    } );
    it( "NOT fail in the absence of a package.json [RES-OUTSIDE]", async () => {
        // Trying to find a dir with reliably no package.json is a nightmare. 
        // But the root shouldn't have one. And we do need to test this, as it's 
        // a catastrophically bad fail.
        const result = await resolveScriptlet( "help", { cwd: "/" } );
        expect( result.moduleUrl ).toEqual( URL_HELP );
    } );
    it( "resolve an auto dependency which has a js-hell key [RES-DEP]", async () => {
        const result = await resolveScriptlet( "child", { cwd: "./test-data/dummy-package-with-auto-child" } );
        expect( fileURLToPath( result.moduleUrl ) ).toEqual( Path_resolve( "./test-data/dummy-package-with-auto-child/node_modules/child/main.mjs" ) );
    } );

    // 2024_4_16: It's not clear whose tests these are. In many cases the external
    // name will be handled by Scriptlet, in others its PackageTree. But at least
    // in some cases its resolveScriptlet. So we run them all from here.
    describe( "match external and internal names", () => {
        it( "- throwing where the esm module is misnamed [NAM-ESM]", async () => {
            const scriptlet = await resolveScriptlet( "./test-data/misnamed.mjs" );
            expect( scriptlet ).toBeInstanceOf( Scriptlet ); 
            expect( () => scriptlet.idl  ).toThrowError( Error, StartsWith( ERROR_NAME_MISMATCH ) );  
        } );
        it( "- throwing where the json package is misnamed [NAM-PKG]", async () => {
            const scriptlet = await resolveScriptlet( "./test-data/misnamed.json" );
            expect( scriptlet ).toBeInstanceOf( Scriptlet ); 
            expect( () => scriptlet.idl  ).toThrowError( Error, StartsWith( ERROR_NAME_MISMATCH ) );  
        } );
        it( "when the internal name is the wildcard name [NAM-$0]", async () => {
            const scriptlet = await resolveScriptlet( "./test-data/wildcarded-name.mjs" ); 
            expect( scriptlet ).toBeInstanceOf( Scriptlet );
            expect( () => scriptlet.idl  ).not.toThrow();
            // 2024_4_18: This is not a complete test - it still has to pass the IDL parser.
            // And that fails.  
        } );
        // probably should be more tests in here.
    } );

    // 2024_4_17:  Again a test of the parsers, but because it's a name test, we put it here.
    it( "when the internal name is the wildcard name [NAM-MIX]", async () => {
        const scriptlet = await resolveScriptlet( "./test-data/mixedCaseName.mjs" ); 
        expect( scriptlet ).toBeInstanceOf( Scriptlet );
        expect( () => scriptlet.idl  ).not.toThrow();  
    } );

} );
