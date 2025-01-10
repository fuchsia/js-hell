import {EXIT_ARGV_ERROR, EXIT_FAILURE, EXIT_IDL_ERROR, EXIT_JS_HELL_EXCEPTION, EXIT_SCRIPTLET_EXCEPTION, EXIT_SUCCESS} from "./exit_codes.mjs";
import main from "./main.mjs";
import {createAsyncTempFilename} from "../utils/createTempFilename.mjs";
import {readFileSync} from "node:fs";
import {Console} from "node:console";
import {Writable} from "node:stream";

const startupDir = process.cwd();
const inspect = false;

async function 
fullstack( argv, { cwd = startupDir } = {} ) {
    const savedCwd = process.cwd();
    console.assert( savedCwd === startupDir, "expected to be in startupDir" );
    if ( cwd ) {
        process.chdir( cwd );
    }
    let result = '';
    // This is normally enough...
    const stdout = {
        write( text ) { result += text; }
    };
    let log = '';
    // ...but Console was too fussy.
    const stderr = new Writable( {
        write(chunk, encoding, callback) {
           // 1. Encoding is typically "buffer".
           // 2. node 22.2, no matter what I do, console.error() etc... insert color.
           // Probably ought to report it.
           log += chunk.toString().replaceAll( /\x1b\[3\dm/g, '' );
           callback?.();
        }
    });
    try {
        // Console shennanigans: this will give us a custom console. I think we're only
        // doing this to disable colorMode. 
        const console = new Console( { stdout: stderr, stderr, colorMode: false  } );
        if ( inspect ) {
            const {default:inspector} = await import( "node:inspector" );
            inspector.open(undefined,undefined,true);
            debugger;
        }
        const errorlevel = await main( { 
                platform: process.platform,
                argv: [ "node", "js-hell", ...Array.isArray(argv)? argv:[argv]], 
                startupDir: process.cwd(),
                cwd:  process.cwd, 
                chdir: process.chdir, 
                stdout,
                stderr,
                console,
                EOL: '\n' 
            } );
        return {result,errorlevel,log:log.trimEnd()}; // remove the trailing NL
    } finally {
        // this could and should be `chdir( startupDir )`
        process.chdir( savedCwd );
    }
}

async function 
fullStackSuccess( argv, options ) {
    const {result,errorlevel,log} = await fullstack( argv, options );
    expect( {errorlevel,log} ).toEqual( {   
        errorlevel:EXIT_SUCCESS,
        log:''
    } );
    return result;
}

async function 
fullStackException( argv ) {
    const {result,errorlevel,log} = await fullstack( argv );
    expect( errorlevel ).toEqual( EXIT_JS_HELL_EXCEPTION);
    expect( result ).toEqual( '' );
    return log;
}


describe( "the host", () => {
    
    // 2024_5_30:  This remains an important whole path test that catches errors in main. More are probably needed.
    it( "should handle an builtin command that's encoded as a single arg", async () => { 
        let result = '';
        const stdout = {
            write( text ) { result += text; }
        };

        const errorlevel = await main( { 
                platform: process.platform, 
                argv: ["node", "js-hell", "echo \"Hello, darkness,\" my      old friend.   " ], 
                cwd:  process.cwd, 
                startupDir: process.cwd(), 
                chdir: process.chdir, 
                stdout 
            } );
        
        expect( result ).toEqual( "Hello, darkness, my old friend." );
        expect( errorlevel ).toEqual( EXIT_SUCCESS );
    } );
    
    it( "should handle the CLI=x syntax", async () => {
        expect( await fullStackSuccess( "CLI=1 echo hello world" ) ).toEqual( "hello world" );
    } );
    it( "should reject an unsupported CLI=x version", async () => {
        expect( await fullStackException( "CLI=1c echo hello world" ) ).toEqual( "js-hell: Unsupported CLI version (1c)" );
    } );
    it( "should handle reparsing and CLI= on a script", async() => {
        const result = await fullstack( "thingymajig", { cwd: "test-data/dummy-package-with-reparsed-script" } );
        // The log contains platform dependent messages; I have confirmed testing the error level is zero 
        // is enough to catch this issue.
        /*expect( result.log ).toEqual( 
`[!1] z:\\www\\js-hell\\test-data\\dummy-package-with-reparsed-script>js-hell '"CLI=1 echo \`hello world\n\`"'
[!1] exited (0)` );*/
        expect( result.errorlevel ).toEqual(0 );
        expect( result.result ).toEqual( 'hello world\n' );        
    } );

    describe( "should handle compound `&&`", () => {
        it( "in a single arg", async () => { 
            let result = '';
            const stdout = {
                write( text ) { result += text; }
            };
        
            const errorlevel = await main( { 
                    platform: process.platform, 
                    argv: ["node", "js-hell", "echo \"Hello, darkness, \" && echo my      old friend.   " ], 
                    cwd:  process.cwd, 
                    startupDir: process.cwd(), 
                    chdir: process.chdir, 
                    stdout 
                } );
            
            expect( result ).toEqual( "Hello, darkness, my old friend." );
            expect( errorlevel ).toEqual( EXIT_SUCCESS );
        } );
        it( "in a single arg with js-hell", async () => { 
            let result = '';
            const stdout = {
                write( text ) { result += text; }
            };
        
            const errorlevel = await main( {  
                    platform: process.platform, 
                    argv: ["node", "js-hell", "echo \"Hello, darkness, \" && js-hell echo my      old friend.   " ], 
                    cwd:  process.cwd, 
                    startupDir: process.cwd(), 
                    chdir: process.chdir, 
                    stdout 
                } );
            
            expect( result ).toEqual( "Hello, darkness, my old friend." );
            expect( errorlevel ).toEqual( EXIT_SUCCESS );
        } );
        it( "in a single arg with js-hell on both (as happens when we wrap a script)", async () => { 
            let result = '';
            const stdout = {
                write( text ) { result += text; }
            };
        
            const errorlevel = await main( { 
                    platform: process.platform,
                    argv: ["node", "js-hell", "js-hell echo \"Hello, darkness, \" && js-hell echo my      old friend.   " ], 
                    cwd:  process.cwd, 
                    startupDir: process.cwd(), 
                    chdir: process.chdir, 
                    stdout 
                } );
            
            expect( result ).toEqual( "Hello, darkness, my old friend." );
            expect( errorlevel ).toEqual( EXIT_SUCCESS );
        } );
        it( "as a separate arg", async () => { 
            let result = '';
            const stdout = {
                write( text ) { result += text; }
            };
        
            const errorlevel = await main( { 
                    platform: process.platform, 
                    argv: ["node", "js-hell", "echo", "Hello, darkness,", "&&", "echo", "my","old", "friend."], 
                    cwd:  process.cwd, 
                    startupDir: process.cwd(), 
                    chdir: process.chdir, 
                    stdout 
                } );
            
            expect( result ).toEqual( "Hello, darkness,my old friend." );
            expect( errorlevel ).toEqual( EXIT_SUCCESS );
        } );
        it( "as a separate arg with js-hell", async () => { 
            const {result,errorlevel} = await fullstack( 
                    ["echo", "Hello, darkness,", "&&", "js-hell", "echo", "my","old", "friend."] );
            
            expect( result ).toEqual( "Hello, darkness,my old friend." );
            expect( errorlevel ).toEqual( 0 );
        } );
        it( "not executing if the second command is false", async () => { 
            const {result,errorlevel} = await fullstack( "false && echo 'hello'" ); 
            expect( result ).toEqual( '' );
            expect( errorlevel ).toEqual( 1 );
        } );
    } );

    it( "should have no trouble reading args before a nested js-hell call", async () => {
        const {result,errorlevel} = await fullstack( [ "--stacktrace", "js-hell", "'echo `hello world`'" ] ); 
        expect( result ).toEqual( 'hello world' );
        expect( errorlevel ).toEqual( 0 );
    } );

    describe( "should handle --help", () => {
        it( "for a builtin", async () => { 
            const {result,errorlevel} = await fullstack( ["echo","--help"] );
            expect( result ).toMatch(/^echo TEXT\.{3}\s/)
            expect( errorlevel ).toEqual( EXIT_SUCCESS );
        });
        it( "for a module", async () => { 
            const {result,errorlevel} = await fullstack( ["./test-data/my-echo.mjs","--help"] );
            expect( result ).toMatch(/^my-echo\s/)
            expect( errorlevel ).toEqual( EXIT_SUCCESS );
        });
    } );

/*
-// FIXME: These are host options we should have nothing to do with.
-describe( "should handle output", () => {
-    it( "defaulting to stdout", () => {
-        // ~.tmp
-        const {args,name,returnValueReceiver:{receiver:output}} = new Idl( "API=1 cmd :: default()" ).instantiate( ["cmd"] );
-        
-        expect( {name,args,output} ).toEqual( {
-            name: 'default',
-            args: [],
-            output: new ForStdout
-        } );
-    } );
-    // This is a test of the host.
-    it( "can be overridden via --output", () => {
-        const {args,name,returnValueReceiver:{receiver:output}} = new Idl( "API=1 cmd :: default()" ).instantiate( ["cmd","--output=dump.log"] );
-        
-        expect({name,args,output}).toEqual( {
-            name: 'default',
-            args: [],
-            output: new FileSync( "dump.log" )
-        } );
-    } );
-} );
*/
    describe( "should handle a pipe", () => {
        it ( "where textual input is turned into json", async () => {
                // This ouputs the text as a string. It's not json.
                expect( await fullStackSuccess( "echo 'wibble' | ./test-data/json-swallow.mjs" ) ).toEqual( '' );  
               
        } );
        it ( "where a number is turned into json", async () => {
                expect( await fullStackSuccess( "sum 1 2 3 4 | ./test-data/json-swallow.mjs" ) ).toEqual( '' );
        } );
        
        it ( "which implies the existence of input", async () => {
            expect( await fullStackSuccess( "echo 'P45' | ./test-data/stdin.mjs" ) ).toEqual( 'P45' );
        } );
        it( "where the file topic is explicitly used to replace a file [PIPE-FILETOPIC-POSITIONAL]", async () => {
            expect( await fullStackSuccess( "echo 'P45' | cat -" ) ).toEqual( 'P45' );
        } );
        it( "failing when the file topic is explicitly used to replace a file", async () => {
            expect( await fullStackException( "echo 'P45' | ./test-data/say-string.mjs -" ) ).toEqual( `js-hell: cannot pipe to "./test-data/say-string.mjs"` );
        } );
        it( "where it goes to an argument [PIPE-FILETOPIC-OPTION]", async () => {
            expect( await fullStackSuccess( `echo '{"option":"value"}' | ./test-data/swallow-file-option.mjs --config=-` ) ).toEqual( `` );
        } );
        it( "failing when used twice [PIPE-FILETOPIC-ONCE-ONLY]", async () => {
            expect( await fullStackException( "echo 'P45' | ./test-data/cat2.mjs - -" ) ).toMatch( /^js-hell: the file topic \(`-`\) can only be used ONCE in the command line / );
        } );
        it( "failing if --output is also used [PIPE-TEELESS]", async () => {
            expect( await fullStackException( "echo 'P45' --output=tmp.txt | cat -" ) ).toMatch( /^js-hell: cannot use `--output` inside a pipe/ );
        } );
    } );
    it( "should treat the file topic as '-' when not used as a file and it's in a list [FILETOPIC-TEXT-ARRAY]", async () => {
        expect( await fullStackSuccess( "echo - --stacktrace" ) ).toEqual( '-' );
    } );
    it( "should treat the file topic as '-' when not used as a file and it's a string [[FILETOPIC-TEXT-SCALAR]", async () => {
        expect( await fullStackSuccess( "./test-data/say-string.mjs - --stacktrace" ) ).toEqual( '-' );
    } );
    
    it( "should handle --log", async() => {
        await createAsyncTempFilename( "log-test", ".out", async logFilename => {
            const stdout = {
                write( text ) {}
            };
            expect( await main( { 
                platform: process.platform, 
                argv: ["node", "js-hell", "test-data/log.mjs", "log", "hello world", "--log", logFilename ], 
                cwd:  process.cwd, 
                startupDir: process.cwd(), 
                chdir: process.chdir, 
                stdout 
            } ) ).toEqual( EXIT_SUCCESS );
            expect ( readFileSync( logFilename, "utf8" ) ).toEqual( "hello world\n" );
        } );

    } );
    it( "should handle 2> as syntactic sugar for --log via args [REDIR-LOG-ARGTOK]", async() => {
        await createAsyncTempFilename( "log-test", ".out", async logFilename => {
            const stdout = {
                write( text ) {}
            };
            expect( await main( { 
                platform: process.platform, 
                argv: ["node", "js-hell", "test-data/log.mjs", "log", "hello world", "2>", logFilename ], 
                cwd:  process.cwd, 
                startupDir: process.cwd(), 
                chdir: process.chdir, 
                stdout 
            } ) ).toEqual( EXIT_SUCCESS );
            expect ( readFileSync( logFilename, "utf8" ) ).toEqual( "hello world\n" );
        } );
    
    } );
    it( "should handle 2> as syntactic sugar for --log via strings [REDIR-LOG-STRTOK]", async() => {
        await createAsyncTempFilename( "log-test", ".out", async logFilename => {
            const stdout = {
                write( text ) {}
            };
            expect( await main( { 
                platform: process.platform, 
                argv: ["node", "js-hell", `test-data/log.mjs log 'hello world' 2>'${logFilename}'` ], 
                cwd:  process.cwd, 
                startupDir: process.cwd(), 
                chdir: process.chdir, 
                stdout 
            } ) ).toEqual( EXIT_SUCCESS );
            expect ( readFileSync( logFilename, "utf8" ) ).toEqual( "hello world\n" );
        } );
    
    } );
    it( "should handle > as syntatic sugar for --output via args [REDIR-OUT-ARGTOK]", async() => {
        await createAsyncTempFilename( "test-output", ".out", async filename => {
            let captured = '';
            const stdout = {
                write( text ) { captured += text; }
            };
            expect( await main( { 
                platform: process.platform, 
                argv: ["node", "js-hell", "echo", "hello world", ">", filename ], 
                cwd:  process.cwd, 
                startupDir: process.cwd(), 
                chdir: process.chdir, 
                stdout 
            } ) ).toEqual( EXIT_SUCCESS );
            expect ( readFileSync( filename, "utf8" ) ).toEqual( "hello world" );
            expect ( captured ).toEqual( '' );
        } );
    
    } );
    it( "should handle > as syntatic sugar for --output via string [REDIR-OUT-STRTOK]", async() => {
        await createAsyncTempFilename( "test-output", ".out", async filename => {
            let captured = '';
            const stdout = {
                write( text ) { captured += text; }
            };
            expect( await main( { 
                platform: process.platform, 
                argv: ["node", "js-hell", `echo 'hello world'>'${filename}'` ], 
                cwd:  process.cwd, 
                startupDir: process.cwd(), 
                chdir: process.chdir, 
                stdout 
            } ) ).toEqual( EXIT_SUCCESS );
            expect ( readFileSync( filename, "utf8" ) ).toEqual( "hello world" );
            expect ( captured ).toEqual( '' );
        } );
    
    } );

    describe( "should handle simple boolean scriptlets", () => {
        it( "that return false", async () => { 
            const {result,errorlevel} = await fullstack( "false" ); 
            expect( result ).toEqual( '' );
            expect( errorlevel ).toEqual( EXIT_FAILURE );
        } );
        it( "that return true", async () => { 
            const {result,errorlevel} = await fullstack( "true" ); 
            expect( result ).toEqual( '' );
            expect( errorlevel ).toEqual( EXIT_SUCCESS );
        } );
    } );
    
    it( "should handle -C so that it can run a script", async () => {
        // Builtins.spec.mjs also tests some parts of `-C`. This is now clearly a feature of the host 
        // and we should do all the testing.
        const {result,errorlevel} = await fullstack( "js-hell -C test-data/dummy-package-with-script script" ); 
        expect( result ).toEqual( 'It worked!' );
        expect( errorlevel ).toEqual( EXIT_SUCCESS );
    } );

    describe( "should handle reduplicated quoting", () => {
        for ( let i = 0; i < 2; ++i ) {
            const cmd = ["echo1", "echo-value"][i];
            const prefix = [ "", "--value=" ][i];
            const name = [ " (first pass)", " (second pass)"][i];
            // Should we all of these for positions and arguments of options?
            it( "striping quotes for `\"'` [REDUP-STRIP-DQ]" + name, async( ) => {
                const {result,errorlevel} = await fullstack( [ cmd, prefix + `"hello world"` ] );
                expect( result ).toEqual( "hello world" );
                expect( errorlevel ).toEqual( EXIT_SUCCESS );
            } );
            it( "striping quotes for `'` [REDUP-STRIP-SQ]"  + name, async( ) => {
                const {result,errorlevel} = await fullstack( [ cmd, prefix + `'hello world'` ] );
                expect( result ).toEqual( "hello world" );
                expect( errorlevel ).toEqual( EXIT_SUCCESS );
            } );
            // The code path is the same for `'` and `"` so we trust the code to get it right.
            it( "leaving an opening `'` [REDUP-LEAVE-SINGLE-SQ]"  + name, async( ) => {
                const {result,errorlevel} = await fullstack( [ cmd, prefix + `'hello world` ] );
                expect( result ).toEqual( "'hello world" );
                expect( errorlevel ).toEqual( EXIT_SUCCESS );
            } );
            it( "leaving an middle `'` [REDUP-LEAVE-PREMATURE-SQ]"  + name, async( ) => {
                const {result,errorlevel} = await fullstack( [ cmd, prefix + `'hello' world` ] );
                expect( result ).toEqual( "'hello' world" );
                expect( errorlevel ).toEqual( EXIT_SUCCESS );
            } );
            it( "leaving a tripple `'` [REDUP-LEAVE-TRIPLE-SQ]"  + name, async( ) => {
                const {result,errorlevel} = await fullstack( [ cmd, prefix + `'hello' world'` ] );
                expect( result ).toEqual( "'hello' world'" );
                expect( errorlevel ).toEqual( EXIT_SUCCESS );
            } );
            it( "successfully hiding an expression [REDUP-QUOTED-EXPR]"  + name, async( ) => {
                const {result,errorlevel} = await fullstack( [ cmd, prefix + `"\${thing}"` ] );
                expect( result ).toEqual( "${thing}" );
                expect( errorlevel ).toEqual( EXIT_SUCCESS );
            } );                                                                                                                                                                
        } 
    } );

    it( "user error should be reported [EXIT-USER-EX]", async () => {
        // Q: Do we really want the full path and extension? Would the basename suffice? 
        const {result,errorlevel,log} = await fullstack( "test-data/error.mjs" );
        expect( errorlevel ).toEqual( EXIT_SCRIPTLET_EXCEPTION );
        expect( EXIT_SCRIPTLET_EXCEPTION ).toEqual( 4 ); // This is hard coded. in the docs.
        expect( result ).toEqual( '' );
        expect( log ).toEqual( "test-data/error.mjs: an unspecified, but deeply significant, error occurred!" ); 
    } );

    // FIXME: find a better home for these.
    // FIXME: we need a `echo-json JSON :: with() $1` command to test. There are versions of fullstack
    // that will do this - even if they don't call main.
    describe( "should parse literal json", () => { 
        it( "written using a double-quotes inside a template literal [LITERAL-JSON-DQ]", async () => {
            const result = await fullStackSuccess( 'echo-json `{"key":"value string"}`' 
            );
            expect( result ).toEqual( '{"key":"value string"}' ); 
        } );
        it( "written used backslash hex escapes inside a template literal [LITERAL-JSON-HEX]", async () => {
            const result = await fullStackSuccess( 
            '"echo-json `{\\x22key\\x22:\\x22value string\\x22}`"' 
            );
            expect( result ).toEqual( '{"key":"value string"}' ); 
        } );
        it( "written as an expression using hex escapes [LITERAL-JSON-EXPR]", async () => {
            const result = await fullStackSuccess( 
            '"echo-json ${ ( {key:`value string`,count:2} ) }"' 
            );
            expect( result ).toEqual( '{"key":"value string","count":2}' ); 
        } );
    } );
    // 2024_12_30: This is here because we want to do a full sublet test.
    describe( "should handle a catalogue sublet", () => {
        it( "when invoked as a directory", async () => {
            const resultOne = await fullStackSuccess( "test-data/dummy-package-with-multiple-scriptlets one" );
            expect( resultOne ).toEqual( 'one' );
            const resultTwo = await fullStackSuccess( "test-data/dummy-package-with-multiple-scriptlets two" );
            expect( resultTwo ).toEqual( 'two' );
        } );  
    } );
    describe( "should handle a nested sublet in a package [PKT-NESTED]", () => {
        it( "when invoked as a directory", async () => {
            const resultOne = await fullStackSuccess( "test-data/dummy-package-with-sublets cmd list" );
            expect( resultOne ).toEqual( ['sing','sung','sang'].join( '\n' )  );
            const resultTwo = await fullStackSuccess( "test-data/dummy-package-with-sublets cmd valid" );
            expect( resultTwo ).toEqual( "yes" );
            const resultThree = await fullStackSuccess( "test-data/dummy-package-with-sublets cmd rm sing" );
            expect( resultThree ).toEqual( "" );
        } );
        it( "when invoked internally", async () => {
            const resultOne = await fullStackSuccess( "cmd list", {cwd: "test-data/dummy-package-with-sublets" } );
            expect( resultOne ).toEqual( ['sing','sung','sang'].join( '\n' ) );
            const resultTwo = await fullStackSuccess( "cmd valid",{cwd: "test-data/dummy-package-with-sublets" } );
            expect( resultTwo ).toEqual( "yes" );
            const resultThree = await fullStackSuccess( "cmd rm sing",{cwd: "test-data/dummy-package-with-sublets" } );
            expect( resultThree ).toEqual( "" );
        } );    
    } );


} );


