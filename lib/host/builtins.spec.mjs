import * as path from "node:path";
import {copyFileSync,readFileSync,constants} from "node:fs";
import {shfy as shtok} from "../args/argtok.mjs";
import {resolveScriptlet}  from "./resolve.mjs";
import {refTextFile_name,refTextFile_text,refUrl_name,refUrl_text, refTemplateFile_name, refTemplateParamsFile_name} from "../testdata.mjs";
import {getGlobalDefaults} from "./main.mjs";
import {createAsyncTempFilename} from "../utils/createTempFilename.mjs";
import {default as Host_main} from "./main.mjs";

const inspect = false;

// 2024_8_12: FIXME: these should be tested using the actual host, and not this cobbled together nonsense; i.e. 
// they should go through main. We now have capture, which makes this much easier.
async function 
fullstack( args )
    {
        if ( inspect ) {
            const {default:inspector} = await import( "node:inspector" );
            inspector.open(undefined,undefined,true);
        }
        if ( typeof args === 'string' )
            args = shtok( args ); 
        const scriptlet = await resolveScriptlet( args[0] );
        let cwd = process.cwd();                   
        const module = await scriptlet.importModule();
        // const module = await scriptlet.importModule();
        const {result} = await scriptlet.idl._exec(
            module, 
            args,
            {
                // 2024_5_30:  This is duplicated from main.mjs and is horrible. Can't we find a better way?
                // There is a Dir object kicking around, can we not use that? Who even uses this?
                path: { 
                    startupDir: cwd, 
                    pwd: () => { return cwd },
                    chdir: dir => {
                        cwd = path.resolve( cwd, dir );
                    },
                },
                globalDefaults: getGlobalDefaults(), 
                // stdout: { write( text ) { result += text } },
                // stderr: process.stderr, // This has to be a proper stream :/
            }
        );
        return result;

    }

async function 
hostCapturingOutput( arg )
    {
        let result = '';
        // 2024_12_1: This predates the introduction of the `capture` arg to the host;
        // that may or may not be relevant. 
        await Host_main( {argv:["","",arg],stdout:{
            write( textOrBuffer ) { 
                result += textOrBuffer.toString( 'utf8' ) }
        }, EOL: '\n' } ); 
        return result;
    }

function chomp( str )
    {
        if ( !str.endsWith( "\n" ) )
            return str;
        return str.slice( 0, str.endsWith( "\r\n" ) ? -2 : -1 ); 
    }

describe( "builtin", () => {
    const FINDSTR_MATCHES = 27;
    const FINDSTR_MATCHES_IN_TEST_DATA = 1; 
          
    const DEBUG = false;
    it( "findstr should work with recurse", async () => {
        const result = ( await fullstack( [ "findstr", "--recurse", "-Xtypes", "export default class", "*.mjs" ] ) ).toArray(); 
        
        const count = result.length ;
        if ( count !== FINDSTR_MATCHES ) {
            console.log( "findstr", result );
        } 
        expect( count ).toEqual( FINDSTR_MATCHES );
    });
    /* FIXME: These are tests of glob */
    it( "findstr should work with recursive globs", async () => {
        const result = ( await fullstack( [ "findstr", "export default class", "-Xtypes", "**/*.mjs" ] ) ).toArray(); 
        const count = result.length ;
        if ( count !== FINDSTR_MATCHES ) {
            console.log( "findstr", result );
        } 
        expect( count ).toEqual( FINDSTR_MATCHES );
    });
    it( "findstr should work with a directory recursive glob", async () => {
        const result = (  await fullstack( [ "findstr", "export default class", "-Xtypes", "lib/**/*.mjs" ] ) ).toArray(); 
        const count = result.length ;
        if ( count !== FINDSTR_MATCHES - FINDSTR_MATCHES_IN_TEST_DATA ) {
            console.log( "findstr", result, result.length );
        } 
        expect( count ).toEqual( FINDSTR_MATCHES - FINDSTR_MATCHES_IN_TEST_DATA );
    });
    it( "echo should work", async () => {
        const result = await fullstack( [ "echo", "This", "is", "a", "test." ] ); 
        expect( result).toEqual( "This is a test." );
    });
    it( "get-projectdir should work", async () => {
        const result = await fullstack( [ "get-projectdir", "package.json" ] ); 
        expect( result).toEqual( process.cwd() );
    });
    it( "get-exports should work", async () => {
        const result = await fullstack( [ "get-exports", "--output-format=JSON", "test-data" + path.sep + "my-echo.mjs" ] );
        expect( result ).toEqual( ['default','js_hell'] );
    });
    it( "get should work", async () => {
        // The result of `get cwd` is currently a `Dir`...
        const result = ( await fullstack( "get cwd" ) ).toString(); 
        expect( result ).toEqual( process.cwd() );
    });
    // Really a test of IDL, but...
    it( "filelist options should be removed from non-filelist commands", () => 
        expectAsync( fullstack( [ "echo", "--recurse", "bad" ]  ) )
        .toBeRejectedWithError( Error, /^[Uu]nknown option "--recurse"$/ ) 
    );
    describe( "the Math primitive",  () => {
        it( "sum should work", async () => {
            const result = await fullstack( [ "sum", "4", "7", "5" ] ); 
            expect( result ).toEqual( 16 );
        } );
        it( "product should work", async () => {
            const result = await fullstack( [ "product", "4", "7", "5" ] ); 
            expect( result ).toEqual( 140 );
        } );
        it( "bitmask should work", async () => {
            const result = await fullstack( [ "bitmask", "4", "7", "5" ] ); 
            expect( result ).toEqual( 176 );
        } );
    } );
    describe( "cat should", () => { 
        it( "work with urls", async () => {
            const result = await fullstack( [ "cat", refUrl_name ] );
            expect( result.toString() ).toEqual( refUrl_text );
        });
        it( "work with files", async () => {
            const result = await fullstack( [ "cat", refTextFile_name ] );
            expect( result.toString() ).toEqual( refTextFile_text );
        });
    } );
    
    // These are testing many things that are not dir itself...
    describe( "dir should", () => { 
        // 2024_8_12: Disabled because this is handled by the host, and we are not currently usign the host for
        // testing!
        it( "default to '*.*' if no directory argument is supplied", async() => {
            const cwd = process.cwd();
            try {
                process.chdir( "test-data/dummy-package" );
                const result = await hostCapturingOutput( "dir -X*.bak --no-last-modified --no-summary --no-color" ); 
                 
                expect( result ).toEqual( 
                    [ ' \tchild-dir\n', 
                      '28\tmain.mjs\n', 
                      '136\tpackage.json\n' ].join( '' ) );
            } finally {
                process.chdir( cwd );
            }
        } );
        it( "accept a drecctory as an argument", async () => {
            const result = ( await fullstack( [ "dir", "--locale=en-GB", "test-data/dir" ] ) ).toArray();
            const e = [ 
            `06/09/2022 13:22\t5\t\u001b[90mtest-data${path.sep}dir${path.sep}\u001b[0mfile.bin\u001b[0m`,
            `\u001b[97m06/09/2022 13:24\t \ttest-data${path.sep}dir${path.sep}subdir\u001b[0m`,
            `06/09/2022 13:24\t4\t\u001b[90mtest-data${path.sep}dir${path.sep}subdir${path.sep}\u001b[0mfour.bin\u001b[0m`,
            `06/09/2022 13:24\t20\t\u001b[90mtest-data${path.sep}dir${path.sep}subdir${path.sep}\u001b[0mtwenty.bin\u001b[0m`,
            "Total: 4 files; 29 bytes"
            ];
            expect( result ).toEqual( e );
        });
        it( "combine -C and a directory argument", async () => {
            const result = ( await fullstack( [ "dir", "--locale=en-GB", "-Ctest-data", "dir" ] ) ).toArray();
            const e = [ `06/09/2022 13:22\t5\t\u001b[90mdir${path.sep}\u001b[0mfile.bin\u001b[0m`,
                        `\u001b[97m06/09/2022 13:24\t \tdir${path.sep}subdir\u001b[0m`,
                        `06/09/2022 13:24\t4\t\u001b[90mdir${path.sep}subdir${path.sep}\u001b[0mfour.bin\u001b[0m`,
                        `06/09/2022 13:24\t20\t\u001b[90mdir${path.sep}subdir${path.sep}\u001b[0mtwenty.bin\u001b[0m`,
                        "Total: 4 files; 29 bytes" ];              
            expect( result ).toEqual( e );
        });
    } );
    describe( "help should", () => {
        // 2024_5_30: Help returns an array. I'm not sure that's sensible.
        it( "work without arguments", async () => 
            expectAsync( fullstack( [ "help" ] ) ).toBeResolved() 
        );
        it( "return help for a builtin", async () => {
            const result = await fullstack( ["help", "echo"] );
            expect( result.join( '\n' ) ).toMatch(/^echo TEXT\.{3}\s/)
        });
        it( "return help for a module", async () => { 
            const result = await fullstack( ["help", "./test-data/my-echo.mjs"] );
            expect( result.join( '\n' ) ).toMatch(/^my-echo\s/)
        });
        it( "return help for the current package when in its directory", async () => {
            const cwd = process.cwd();
            try {
                process.chdir( "test-data/dummy-package" );
                const result = await fullstack( ["help"] );
                expect( result.join( '\n' ) ).toMatch( /^package:\s+dummy/m ); 
            } finally {
                process.chdir( cwd );
            };
        } );
    } );
    // 2023_9_11: These appear to be the only tests of the resolver.
    describe( "resolve should work on", () => {
        it( "a js module", async () => {
            const result = await fullstack( [ "resolve", "test-data/my-echo.mjs" ] );
            expect( result ).toEqual( new URL( "../../test-data/my-echo.mjs", import.meta.url ).toString() ); 
        } );
        it( "a dir", async () => {
            const result = await fullstack( [ "resolve", "test-data/dummy-package" ] );
            expect( result ).toEqual( new URL( "../../test-data/dummy-package/main.mjs", import.meta.url ).toString() ); 
        } );
        it( "a dependency of the root package", async () => {
            const result = await fullstack( [ "resolve", "jasmine" ] );
            expect( result ).toEqual( new URL( "../../node_modules/jasmine/lib/jasmine.js", import.meta.url ).toString() );
        } );
    } );
    
    describe( "json-set", () => {
        it( "should work with a literal key", async () => {
            await createAsyncTempFilename( "jshell-test-json-set-1", ".json", async filename => {
                copyFileSync( "test-data/editable.json", filename, constants.COPYFILE_EXCL );
                const result = await fullstack( [ "json-set", filename, "key2", "234" ] );
                expect( result ).toBeUndefined();
                const finalText = readFileSync( filename, "utf8" );
                expect( finalText ).toEqual(
`{
    "key": [
        4,
        5,
        6,
        [
            "hello"
        ]
    ],
    "key2": 234
}`                 
                );
            } ); 
        } );
    } );
    describe( "template should", () => {
        it( "work with a JSON source [BUILTIN-TEMPLATE-JSON]", async () => {
            const result = await hostCapturingOutput( `template \`${JSON.stringify({value1:1,value2:200} )}\` ${refTemplateFile_name}` );
            expect ( result ).toEqual( `The results of the experiment are \`1\` and \`200\`.` );                                                                                                                                                                                                                
        } );
        it( "work with a JSON_FILE source [BUILTIN-TEMPLATE-FILE]", async () => {
            const result = await hostCapturingOutput( `template ${refTemplateParamsFile_name} ${refTemplateFile_name}` );
            expect ( result ).toEqual( `The results of the experiment are \`a\` and \`b\`.` );                                                                                                                                                                                                                
        } );
        it( "work with a FileTopic source [BUILTIN-TEMPLATE-FILETOPIC]", async () => {
            const result = await hostCapturingOutput( `json ${refTemplateParamsFile_name} | template - ${refTemplateFile_name}` );
            expect ( result ).toEqual( `The results of the experiment are \`a\` and \`b\`.` );                                                                                                                                                                                                                
        } );
    });
});
