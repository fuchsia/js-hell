import {sep as dirsep, join as Path_join} from "node:path";
import { pathToFileURL } from 'node:url';
import {readFileSync as Fs_readFileSync} from "node:fs";
import FileSync from "./types/FileSync.mjs";
import File from "./types/File.mjs";
import ForStdout from "./types/Stream.mjs";
import Idl from "./Idl.mjs";
import CliOption,{ARGVALUE_NONE,ARGVALUE_REQUIRED}  from "./usage/CliOption.mjs";
import {ERROR_MISSING_WS} from "./usage/parse.mjs";
import StartsWith from "./utils/StartsWith.mjs";
import {VIA_VECTOR, VIA_STREAM, VIA_BUFFER} from "./bind/Outputter.mjs";
import {realiseTo} from "./symbols.mjs";

// FIXME: the fetch test probably should be here then - should in a fetch.spec.mjs? Or main.spec.mjs
// But this is partly covering a flying monkey.
import jshellFetch from "./host/fetch.mjs";

import {refTextFile_name,refTextFile_basename,refTextFile_fullPath,refTextFile_text,refTextFile_buffer,refTextFile_size, refTextFile_lastModified,
    refUrl_name,refUrl_text, refMissingFile_name, refMissingFile_type, refMissingFile_fullPath,
    refMissingFileExtless_name, 
    
    refJsonFile_name,refJsonFile_basename,refJsonFile_fullPath,refJsonFile_text,refJsonFile_value,refJsonFile_buffer, refJsonFile_size, refJsonFile_lastModified} from "./testdata.mjs";


beforeEach(function() {
    jasmine.addCustomEqualityTester(( a,b ) => {
        if ( a instanceof FileSync && b instanceof FileSync  )
            return a.toFilename( ) === b.toFilename(); 
    });
    jasmine.addCustomEqualityTester(( a,b ) => {
        if ( a instanceof File && b instanceof File  )
            return a.name === b.name
             && a.lastModified === b.lastModified
             && a.webkitRelativePath === b.webkitRelativePath
             && a.size === b.size     
    });
    jasmine.addCustomEqualityTester(( a,b ) => {
        if ( a instanceof ForStdout && b instanceof ForStdout )
            return true; 
    });
});

async function captureArgs( idlStr, args ) {
    
    const idl = new Idl( idlStr.startsWith( 'API=' ) || idlStr.startsWith( "IDL=" ) ? idlStr : `IDL=1 ${idlStr}` );
     
    return {
        // Contrast this with `await idl._exec( (...capturedArgs) => capturedArgs, args, {path:{chdir: cwd => capturedCwd = cwd }} |> %.result` 
        args: ( await idl._exec( (...capturedArgs) => capturedArgs, args  ) ).result,
    }
}

async function 
captureOnlyArgs( idlStr, args ) {
    const idl = new Idl( idlStr );
    return ( await idl._exec( (...capturedArgs) => capturedArgs, args  ) ).result;
}

// FIXME: These tests have no home.
describe( "type realisation", () => {
    
    describe( "should handle large integers", () => {
        it( "allowing casting to a BigInt", async () => {
            const {args} = await captureArgs( "cmd INT :: default($1.toBigInt())", ['cmd',`${10n**17n+1n}`] );  
            expect( args ).toEqual( [10n**17n+1n] );
        } );
        it( "allowing casting to a Number", async () => {
            const {args} = await captureArgs( "cmd INT :: default($1.toNumber())", ['cmd',`${10n**17n+1n}`] );  
            expect( args ).toEqual( [Number(10n**17n+1n)] );
        } );
        it( "and rejecting if no cast", async () => {
            const promise = captureArgs( "cmd INT :: default($1)", ['cmd',`${10n**17n+1n}`] );
            await expectAsync( promise ).toBeRejected(); 
        } );
    } );
    describe( "should handle globs", () => {
        it( "allowing casting to a RegExp", async () => {
            const {args} = await captureArgs( "cmd GLOB :: default($1.toRegExp())", ['cmd',`*`] );  
            expect( args ).toEqual( [/^.*?$/] );
        } );
        it( "defaulting to a string", async () => {
            const {args} = await captureArgs( "cmd GLOB :: default($1)", ['cmd',`*`] );  
            expect( args ).toEqual( [ '*' ] );
        } );
          
        
    } );
    it(  "shouldn't resolve promises without await", async () => {
        const {args} = await captureArgs( "cmd FILE :: default($1.text())", ['cmd',refTextFile_name] );
        expect( args[0] ).toBeInstanceOf( Promise );
    } );
    it(  "should resolve promises with await", async () => {
        const {args} = await captureArgs( "cmd FILE :: default(await $1.text())", ['cmd',refTextFile_name] );
        expect( args[0] ).toBe( refTextFile_text );
    } );

} );

describe( "enum positionals", () => {
    it( "should be allowed", async () => {
        const {args} = await captureArgs( "cmd (add|remove) NAME :: default($1,$2)", ['cmd','remove','mything'] );  
        expect( args ).toEqual( ['remove','mything'] );
    } );
    it( "should NOT be allowed to juxtapose", async () => {
        const promise = captureArgs( "cmd (add|remove)(foo|bar) :: default($1,$2)", ['cmd','remove','bar'] );  
        await expectAsync( promise ).toBeRejectedWithError( Error, StartsWith( ERROR_MISSING_WS ) );
    } );
    it( "should fail if illegal value", async () => {
        const invocation = captureArgs( "cmd (add|remove) NAME :: default($1,$2)", ['cmd','ls','mything'] );  
        await expectAsync( invocation ).toBeRejectedWithError( Error, /^Invalid value "ls" for \$1/ );
    } );
} );


// 2022_10_11: This is a test of the URL constructor in types, but it needs all of this to be run.
 it( "should turn an url into an absolute path with the current directory", async () => {
    const cwd = process.cwd();
    const {args} = await captureArgs( "cmd URL :: default($1)", ['cmd','example.txt'] );  
    expect( args[0] ).toEqual( pathToFileURL( Path_join( cwd, 'example.txt' ) ) );
} );
    

describe( "named", () => {
    it( "long-duplicates should be impossible", async  () => {
        await expectAsync(  captureArgs( "cmd --option --option :: default(option)", ['cmd','--option'] ) )
            .toBeRejectedWithError( Error, StartsWith( 'Duplicate option' ));
    } );
    it( "short-duplicates should be impossible",  async () => {
        await expectAsync( captureArgs( "cmd (--option|-o) (--other|-o)=TEXT :: default(option,other)", ['cmd','--option','--other=hello'] ) )
            .toBeRejectedWithError( Error, StartsWith( 'Duplicate option' ));
    } );
    it( "short-duplicates should be impossible even with optional args",  async () => {
        await expectAsync( captureArgs( "cmd (--option|-o) [(--other|-o)=TEXT] :: default(option,other='')", ['cmd','--option','--other=hello'] ) )
            .toBeRejectedWithError( Error, StartsWith( 'Duplicate option' ));
    } );
} );


describe( "discriminated unions", () => {
    it( "should be allowed", async () => {
        const invocation = await captureArgs( "cmd (TOPIC_NAME|STRING) :: default($1)", ['cmd','res mirabilis'] );  
        expect( invocation ).toEqual( {
            args: ['res mirabilis']
        } );
    } );
    it( "should NOT be allowed to juxtapose", async () => {
        const invocation = captureArgs( "cmd (SOME_NAME|OTHER_NAME)(SOME_TEXT|OTHER_TEXT) :: default($1,$2)", ['cmd','foo','bar'] );  
        await expectAsync( invocation ).toBeRejectedWithError( Error, StartsWith( ERROR_MISSING_WS ) );
    } );
    it( "should work for different file types", async () => {
        // FIXME: this shouldbn't be testing here; it needs a specialised dir
        const invocation = await captureArgs( "cmd (MJS_FILE|JS_FILE)... :: default($1.map( f => f.toFilename() ))", ['cmd','test-data/discriminated-union'] );  
        expect( invocation ).toEqual( { 
            args: [ [ 
            `test-data${dirsep}discriminated-union${dirsep}file1.js`, 
            `test-data${dirsep}discriminated-union${dirsep}file2.js`, 
            `test-data${dirsep}discriminated-union${dirsep}file3.mjs`,
            `test-data${dirsep}discriminated-union${dirsep}child${dirsep}file5.mjs`,
            `test-data${dirsep}discriminated-union${dirsep}child${dirsep}file7.js`,
            ]
            ]
        } );
    } );
} );

xit( "vector return value should be output as a vector", () => {
    const invocation = new Idl( "IDL=1 cmd FILE :: default() as Buffer[]" ).instantiate( ['cmd','temp.txt'] );
    expect( invocation.resultTypeAssertion ).toEqual( { basetype: 'Buffer', enum: '[]' } ); 
} );


describe( "The IDL", () => {
    // 2024_5_30: Grandfathered from main.spec.mjs. Should be covered elsewhere, I'm sure.    
    it( "should object when a name is not in use", () => 
        expect( 
            () => new Idl( `IDL=1 cmd --arg :: default()` )
         ).toThrowError( Error, /left unbound$/ )
    )
    // 2024_5_30: Grandfathered from main.spec.mjs. Should be covered elsewhere, I'm sure.
    it( "should object when the first argument is an option", () => { 
        expect( () => new Idl( "IDL=1 --arg :: default(arg)" ) )
        // FIXME: check the eror.
        .toThrowError( Error )
    } )
    // 2024_5_30: Grandfathered from main.spec.mjs. Should be covered elsewhere, I'm sure.
    it( "should manage a simple command", async () => { 
        const {result} = await new Idl( "IDL=1 cmd :: default()" )._exec( () => 0, "cmd" );
        expect( result ).toEqual( 0 );
    });
    // 2024_5_30: Grandfathered from main.spec.mjs. Should be covered elsewhere, I'm sure.
    it( "should handle fetch", async () => {
        // The whole point of this was to check main supplies fetch. So we bypass that test....
        const globalDefaults = { fetch: jshellFetch, }; 
        const {result} = await new Idl( "IDL=1 cmd URL :: default(await (await fetch($1)).text())" )._exec( text => text, ["cmd", refUrl_name], { globalDefaults} );
        expect( result ).toEqual( refUrl_text );
    });
    // 2024_5_30: Grandfathered from main.spec.mjs. Should be covered elsewhere, I'm sure.
    it( "should apply the Response.prototype.buffer flying monkey", async () => {
        // see above.
        const globalDefaults = { fetch: jshellFetch, };
        const {result} = 
            await new Idl( "IDL=1 cmd URL :: default((await (await fetch($1)).buffer()).toString())" )
                ._exec( text => text, ["cmd", refUrl_name], { globalDefaults} ); 
        expect( result ).toEqual( refUrl_text );
    });
} )



it( "Should be possible to await on a filetext() should work", async () => {
    // NB The alternative is tested in the type realisation code.
    const invocation = await captureArgs( "cmd FILE :: default(await $1.text())", ['cmd',refTextFile_name] );
    expect( invocation.args ).toEqual( [ refTextFile_text ] );
} );

 
it( "Flying monkey for Iterator.prototype.toArray - i.e. can spot iterable", async () => {
    const invocation = await captureArgs( "cmd STRING... :: default( (*$1).toArray())", ['cmd', 'one', 'two', 'three', 'four', 'five'] );  
    expect( invocation.args[0] ).toEqual( [ 'one', 'two', 'three', 'four', 'five' ] );
} );

it ( "IDL should create __dirname where the module url is present (OLD)", () => {
    // FIXME: we should actually test that we get __dirname global as a dir.
    const {__dirname} = new Idl( 'IDL=1 cmd :: ()', undefined, pathToFileURL( './something.mjs' ) );
    expect( __dirname.at( -1 ) ).toEqual( dirsep );
    expect( __dirname.slice( 0, -1 ) ).toEqual( process.cwd() );
} );

it ( "IDL should create __dirname where the module url is present (NEW)", () => {
    // FIXME: we should actually test that we get __dirname global as a dir.
    const {__dirname} = new Idl( 'IDL=1 cmd :: ()', {}, pathToFileURL( './something.mjs' )  );
    expect( __dirname.at( -1 ) ).toEqual( dirsep );
    expect( __dirname.slice( 0, -1 ) ).toEqual( process.cwd() );
} );

it ( "IDL not fail to create the __dirname (OLD)", () => {
    const {__dirname} = new Idl( "IDL=1 cmd ::()", undefined, 'http://example.com/script.mjs' );
    expect( __dirname ).toBeUndefined();
} );

it ( "IDL not fail to create the __dirname (NEW)", () => {
    const {__dirname} = new Idl( 'IDL=1 cmd :: ()' , {}, 'http://example.com/script.mjs' );
    expect( __dirname ).toBeUndefined();
} );

it ( "Indexed positionals should be named by index [BIND-IPOS]", async () => {
    const {args} = await captureArgs( 'IDL=1 cmd TEXT1 TEXT2 :: default($text1, $text2)', ["cmd", "hello", "world"]);
    expect( args ).toEqual( [ "hello", "world" ] );
} );
it ( "Subtyped positionals should be named by subtype [BIND-SUB]", async () => {
    const {args} = await captureArgs( 'IDL=1 cmd FIRST_TEXT SECOND_TEXT :: default($firstText, $secondText)', ["cmd", "hello", "world"]);
    expect( args ).toEqual( [ "hello", "world" ] );
} );

describe( "A boolean option", () => {
    // 2024_6_10: Q: Why should this throw?
    // A: It means you always have to add `--possible` but it conveys no information until we allow `--no-possible`
    // (whic, apparently, we don't.) 
    xit ( "throws if mandatory. [BOOL-MAND]", async () => {
        expect( () => new Idl( 'IDL=1 cmd --possible :: default(possible)' , {}, 'http://example.com/cmd.mjs' ) )
        .toThrow();
    } );
    it ( "defaults to false. [BOOL-UNSET]", async () => {
        const {result} = await ( new Idl( 'IDL=1 cmd [--possible] :: default(possible)' , {}, 'http://example.com/cmd.mjs' )._exec( x => x, "cmd" ) );
        expect( result ).toEqual( false );
    } );
    it ( "is true when set. [BOOL-SET]", async () => {
        const {args} = await captureArgs( 'IDL=1 cmd [--possible] :: default(possible)',  "cmd --possible" );
        expect( args ).toEqual([ true] );
    } );
    it ( "doesn't allow it's `--no-` negation. [BOOL-NEG]", async () => {
        const idl = await new Idl( 'IDL=1 cmd [--possible] :: default(possible)' , {}, 'http://example.com/cmd.mjs' );
        // 2024_4_19: I thought we allowed this, but apparently not.
        await expectAsync( idl._exec( x => x, "cmd --no-possible" ) ).toBeRejectedWithError( TypeError, StartsWith( `Unknown option "--no-possible"` ) );
    } );
} );




describe( "A `--no-` option", () => { 
    it (  "defaults to true. [NO-UNSET]", async () => {
        const {result} = await ( new Idl( 'IDL=1 cmd [--no-possible] :: default(possible)' , {}, 'http://example.com/cmd.mjs' )._exec( x => x, "cmd") );
        expect( result ).toEqual( true );
    } );
    it ( "is false when set. [NO-SET]", async () => {
        const {result} = await ( new Idl( 'IDL=1 cmd [--no-possible] :: default(possible)' , {}, 'http://example.com/cmd.mjs' )._exec( x => x, "cmd --no-possible" ) );
        
        expect( result ).toEqual( false );
    } );
    
    it ( "option doesn't allows its affirmation. [NO-AFFIRM]", async () => {
        const result = ( new Idl( 'IDL=1 cmd [--no-possible] :: default(possible)' , {}, 'http://example.com/cmd.mjs' )._exec( x => x, "cmd --possible" ) );
        await expectAsync( result ).toBeRejectedWithError( TypeError, StartsWith( `Unknown option "--possible"` ) );
    } );
} );

describe( "When both forms of a boolean option are present," , () => { 
    it ( "the user must be default it [TRISTATE-ABSENT]", async () => {
        const result = ( new Idl( 'IDL=1 cmd [--possible] [--no-possible] :: default(possible)' , {}, 'http://example.com/cmd.mjs' )._exec( x => x, "cmd") );
        // FIXME: this should be an early error. (A record exists, but it's uninitialised and ecmascript says GetBindingValue() will throw if uninitialized.)
        await expectAsync( result ).toBeRejectedWithError( ReferenceError, StartsWith( `Missing parameter "possible"` ) );
    } );
    
    it ( "the default is honoured. [TRISTATE-DEFAULT]", async () => {
        const {result} = await ( new Idl( 'IDL=1 cmd [--positive] [--no-positive] :: default((positive?1:-1)??0)' , {}, 'http://example.com/cmd.mjs' )._exec( x => x, "cmd") );
        expect( result ).toEqual( 0 );
    } );


    it ( "the affirmative must be honoured. [TRISTATE-TRUE]", async () => {
        // FIXME: the lack of defaulting should cause this to be caught as an error.
        const {result} = await ( new Idl( 'IDL=1 cmd [--possible] [--no-possible] :: default(possible)' , {}, 'http://example.com/cmd.mjs' )._exec( x => x, "cmd --possible") );
        expect( result ).toEqual( true );
    } );
    
    it ( "the negation must be honoured. [TRISTATE-FALSE]", async () => {
        // FIXME: the lack of defaulting should cause this to be caught as an error.
        const {result} = await ( new Idl( 'IDL=1 cmd [--possible] [--no-possible] :: default(possible)' , {}, 'http://example.com/cmd.mjs' )._exec( x => x, "cmd --no-possible") );
        expect( result ).toEqual( false );
    } );
} );

it ( "It shouldn't be possible to have a duplicate boolean option [NODUP-BOOL]", async () => {
    // 2024_4_19: The current mechanims means what's true for booleans, should be true for all.
    expect( () => new Idl( 'IDL=1 cmd [--possible] [--possible] :: default(possible)' , {}, 'http://example.com/cmd.mjs' ) ).toThrowError( Error, StartsWith( "Duplicate option" ) );
    expect( () => new Idl( 'IDL=1 cmd [--no-possible] [--no-possible] :: default(possible)' , {}, 'http://example.com/cmd.mjs' ) ).toThrowError( Error, StartsWith( "Duplicate option" ) );
} );

describe( "A recurring boolean", () => {
    it( "defaults to zero [MULTIBOOL-ABSENT]", async () => {
        const{result} = await new Idl(
            `IDL=1 
            loggable [(--verbose|-v)]...  
            :: default({verbose})` )._exec( x => x.verbose, "loggable"  );
        expect( result ).toEqual( 0 );
    } );
    it( "is `1` when called once [MULTIBOOL-1]", async () => {
        const{result} = await new Idl(
            `IDL=1 
            loggable [(--verbose|-v)]...  
            :: default({verbose})` )._exec( x => x.verbose, "loggable --verbose"  );
        expect( result ).toEqual( 1 );
    } );
    it( "is `2` when called twice [MULTIBOOL-2]", async () => {
        const{result} = await new Idl(
            `IDL=1 
            loggable [(--verbose|-v)]...  
            :: default({verbose})` )._exec( x => x.verbose, "loggable --verbose -v"  );
        expect( result ).toEqual( 2 );
    } );
    it( "is `3` when called thrice [MULTIBOOL-3]", async () => {
        const{result} = await new Idl(
            `IDL=1 
            loggable [(--verbose|-v)]...  
            :: default({verbose})` )._exec( x => x.verbose, "loggable -vvv"  );
        expect( result ).toEqual( 3 );
    } );
} );


it ( "It shouldn't be possible to call a $0 command with any text {[$0]}", async () => {
    
    const {result} = await ( new Idl( 'IDL=1 $0 :: default()' , {}, 'http://example.com/cmd.mjs' )._exec( ()  => "result", "anything" ) );
    expect( result ).toEqual( "result" );
    
} );

it ( "IDL._exec 'with'-test", async () => {
    
    const {result} = await ( new Idl( 'IDL=1 cmd STRING :: with (Archive,flush) flush(new Archive().method($1))' , { }, 'http://example.com/cmd.mjs' )
        ._exec( { 
            Archive: class Archive {
                method( p ) { 
                    this.value = `<${p}>`;
                    return this; 
                }
            },
            flush: o => o.value
        }, "cmd anything" ) );
    expect( result ).toEqual( "<anything>" );
    
} );

describe( "IDL._exec pipeline", () => {
    
    it( "simple", async () => {
        const {result} = await ( new Idl( 'IDL=1 cmd STRING :: with (Archive) new Archive() |> %.method( $1 ) |> %.value' , { }, 'http://example.com/cmd.mjs' )
            ._exec( { 
                Archive: class Archive {
                    method( p ) { 
                        this.value = `{${p}}`;
                        return this; 
                    }
                },
            }, "cmd anything" ) );
        expect( result ).toEqual( "{anything}" );
    } );
    
    it( "foreach", async () => {
        // const {result} = await ( new Idl( 'IDL=1 cmd ARCHIVE_FILE FILE... :: with (Archive) new Archive() |> $2.forEach( _ => %1.add( _ ) ) |> %1.toUint8Array() -> $1.replaceWith( % )' , { }, 'http://example.com/cmd.mjs' )        
        const {result} = await ( new Idl( 'IDL=1 cmd STRING... :: with (Archive) new Archive() |> $1.forEach( _ => %.add( _ ) ) |> %1.value' , { }, 'http://example.com/cmd.mjs' )
            ._exec( { 
                Archive: class Archive {
                    value = '';
                    add( p ) { 
                        if ( this.value )
                            this.value += '+';
                        this.value += p;
                    }
                },
            }, "cmd 1 2 3" ) );
        expect( result ).toEqual( "1+2+3" );
    } );
    
} );
  
for ( const fn of ["FILE_NAME", "FILENAME"] ) {
    it( `${fn} should realise as a string [FN-REAL]`, async () => {
        const {result} = await( new Idl( `IDL=1 cmd [--option=${fn}] ${fn} :: default( $1, {option} )` )
            ._exec( 
                ( $1, { option } ) => [ $1, option ],
                `cmd ${refTextFile_name} --option=${refJsonFile_name}`
            ) );
        expect( result ).toEqual( [ refTextFile_name, refJsonFile_name ] );
    } );
}

it( `FILE should realise as a buffer in call args [FILE-REAL]`, async () => {
    const {result} = await( new Idl( `IDL=1 cmd [--option=FILE] FILE :: default( $1, {option} )` )
        ._exec( 
            ( $1, { option } ) => [ $1, option ],
            `cmd ${refTextFile_name} --option=${refJsonFile_name}`
        ) );
    expect( result ).toEqual( [ refTextFile_buffer, refJsonFile_buffer ] );
} );
// 2024_5_3: This is a test of the type realisation system, not whether a file realises properly.
it( "FILE realise as a buffer in with expr [FILE-REAL]", async () => {
    const {result} = await( new Idl( `IDL=1 cmd FILE :: with() $1` )
        ._exec( 
            () => ({}),
            `cmd ${refTextFile_name}`
        ) );
    expect( result ).toEqual( refTextFile_buffer );
} );

for ( const fn of [ "FILE", "FILE_NAME", "FILENAME"] ) {
    describe( `${fn} should`, () => {
        it( "have a `name` property than returns the basename [FILE-NAME]", async () => {
            const {result} = await( new Idl( `IDL=1 cmd [--option=${fn}] ${fn} :: default( $1.name, {option.name} )` )
                ._exec( 
                    ( $1, { name } ) => [ $1, name ],
                    `cmd ${refTextFile_name} --option=${refJsonFile_name}`
                ) );
            expect( result ).toEqual( [ refTextFile_basename, refJsonFile_basename ] );
        } );
        it( "have a `toURL()` method that returns the file: url [FILE-URL]", async () => {
            const {result} = await( new Idl( `IDL=1 cmd [--option=${fn}] ${fn}  :: default( $1.toURL(), option.toURL() )` )
                ._exec( 
                    ( $1, $2 ) => [ $1, $2 ],
                    `cmd ${refTextFile_name} --option=${refJsonFile_name}`
                ) );
            expect( result ).toEqual( [ pathToFileURL( refTextFile_fullPath ), pathToFileURL( refJsonFile_fullPath ) ] );
        } );
        it( "have a `toURL()` method that returns the file: url - even when the file is missing [FILE-URL-MISSING]", async () => {
            const {result} = await( new Idl( `IDL=1 cmd ${fn}  :: default( $1.toURL() )` )
                ._exec( 
                    ( $1 ) => $1,
                    `cmd ${refMissingFile_name}`
                ) );
            expect( result ).toEqual( pathToFileURL( refMissingFile_fullPath ) );
        } );
        
        it( "have a `webkitRelativePath` property than returns the passed name [FILE-RELPATH]", async () => {
            const {result} = await( new Idl( `IDL=1 cmd [--option=${fn}] ${fn} :: default( $1.webkitRelativePath, {option.webkitRelativePath} )` )
                ._exec( 
                    ( $1, { webkitRelativePath } ) => [ $1, webkitRelativePath ],
                    `cmd ${refTextFile_name} --option=${refJsonFile_name}`
                ) );
            expect( result ).toEqual( [ refTextFile_name, refJsonFile_name ] );
        } );
        
        it( "have a `fullPath` property that returns the absolute path [FILE-FULLPATH]", async () => {
            const {result} = await( new Idl( `IDL=1 cmd [--option=${fn}] ${fn} :: default( $1.fullPath, {option.fullPath} )` )
                ._exec( 
                    ( $1, { fullPath } ) => [ $1, fullPath ],
                    `cmd ${refTextFile_name} --option=${refJsonFile_name}`
                ) );
            expect( result ).toEqual( [ refTextFile_fullPath, refJsonFile_fullPath ] );
        } );
        describe( "has an `isFile` property that", () => {
            it( "is true for an extant plain file [FILE-IS]", async () => {
                const {result} = await( new Idl( `IDL=1 cmd [--option=${fn}] ${fn} :: default( $1.isFile, {option.isFile} )` )
                    ._exec( 
                        ( $1, { isFile } ) => [ $1, isFile ],
                        `cmd ${refTextFile_name} --option=${refJsonFile_name}`
                    ) );
                expect( result ).toEqual( [ true, true ] );
            } );
            it( "is false for a missing file [FILE-MISSING]", async () => {
                const {result} = await( new Idl( `IDL=1 cmd [--option=${fn}] ${fn} :: default( $1.isFile, {option.isFile} )` )
                    ._exec( 
                        ( $1, { isFile } ) => [ $1, isFile ],
                        `cmd ${refMissingFile_name} --option=${refMissingFile_name}`
                    ) );
                expect( result ).toEqual( [ false, false ] );
            } );
        } );
         
        it( "has an `isDirectory` property that is false [FILE-NOTDIR]", async () => {
            const {result} = await( new Idl( `IDL=1 cmd [--option=${fn}] ${fn} :: default( $1.isDirectory, {option.isDirectory} )` )
                ._exec( 
                    ( $1, { isDirectory } ) => [ $1, isDirectory ],
                    `cmd ${refTextFile_name} --option=${refJsonFile_name}`
                ) );
            expect( result ).toEqual( [ false, false ] );
        } );
        // 2024_5_28: FIXME: this doesn't test all the path ways.
        it( "has a `size` property that is the file's size [FILE-SIZE]", async () => {
            const {result} = await( new Idl( `IDL=1 cmd [--option=${fn}] ${fn} :: default( $1.size, {option.size} )` )
                ._exec( 
                    ( $1, { size } ) => [ $1, size ],
                    `cmd ${refTextFile_name} --option=${refJsonFile_name}`
                ) );
            expect( result ).toEqual( [ refTextFile_size, refJsonFile_size ] );
        } );
        it( "has a `size` property that is NaN when the file doesn't exist [FILE-SIZE-MISSING]", async () => {
            const {result} = await( new Idl( `IDL=1 cmd ${fn} :: default( $1.size )` )
                ._exec( 
                    ( $1 ) => $1,
                    `cmd ${refMissingFile_name}`
                ) );
            expect( result ).toBeNaN();
        } );
        // 2024_5_28: FIXME: this doesn't test all the path ways.
        it( "has a `lastModified` property that is the file's modification time [FILE-DATE]", async () => {
            const {result} = await( new Idl( `IDL=1 cmd [--option=${fn}] ${fn} :: default( $1.lastModified, {option.lastModified} )` )
                ._exec( 
                    ( $1, { lastModified } ) => [ $1, lastModified ],
                    `cmd ${refTextFile_name} --option=${refJsonFile_name}`
                ) );
            expect( result ).toEqual( [ refTextFile_lastModified, refJsonFile_lastModified ] );
        } );
        it( "has a `lastModified` property that is NaN when the file doesn't exist [FILE-DATE-MISSING]", async () => {
            const {result} = await( new Idl( `IDL=1 cmd ${fn} :: default( $1.lastModified )` )
                ._exec( 
                    ( $1 ) => $1,
                    `cmd ${refMissingFile_name}`
                ) );
            expect( result ).toBeNaN();
        } );
        
        it( "has a `type` property that is the file's mime time [FILE-TYPE]", async () => {
            const {result} = await( new Idl( `IDL=1 cmd [--option=${fn}] ${fn} :: default( $1.type, {option.type} )` )
                ._exec( 
                    ( $1, { type } ) => [ $1, type ],
                    `cmd ${refTextFile_name} --option=${refJsonFile_name}`
                ) );
            // We can hard code the type because it's implicit in the name - text file or json file.
            expect( result ).toEqual( [ 'text/plain', 'application/json' ] );
        } );
        it( "has a `type` property even when the file is missing [FILE-TYPE-MISSING]", async () => {
            const {result} = await( new Idl( `IDL=1 cmd ${fn} :: default( $1.type )` )
                ._exec( 
                    ( $1 ) => $1,
                    `cmd ${refMissingFile_name}`
                ) );
            expect( result ).toEqual( refMissingFile_type );
        } );
        it( "has a `type` property that's empty for missing extensions [FILE-TYPE-NOEXT]", async () => {
            const {result} = await( new Idl( `IDL=1 cmd ${fn} :: default( $1.type )` )
                ._exec( 
                    ( $1 ) => $1,
                    `cmd ${refMissingFileExtless_name}`
                ) );
            expect( result ).toEqual( "" );
        } );
        it( "have a `toArrayBuffer()` method that returns the contents as an arraybuffer [FILE-TO-ARRAYBUFFER]", async () => {
            // 2024_5_28: FIXME: this has two code paths, we only test one.
            const {result} = await( new Idl( `IDL=1 cmd [--option=${fn}] ${fn} :: default( $1.toArrayBuffer(), option.toArrayBuffer() )` )
                ._exec( 
                    ( $1, $2 ) => [ $1, $2 ],
                    `cmd ${refTextFile_name} --option=${refJsonFile_name}`
                ) );
                         
            expect( result.map( arrayBuffer => Buffer.from( arrayBuffer ) ) ).toEqual( [ refTextFile_buffer, refJsonFile_buffer ] );
        } );
        it( "have an `arrayBuffer()` method that promises the contents as text [FILE-ARRAYBUFFER]", async () => {
            // 2024_5_28: FIXME: this has two code paths, we only test one.
            const {result} = await( new Idl( `IDL=1 cmd [--option=${fn}] ${fn} :: default( $1.arrayBuffer(), { buffer: option.arrayBuffer() } )` )
                ._exec( 
                    ( $1, {buffer} ) => [ $1, buffer ],
                    `cmd ${refTextFile_name} --option=${refJsonFile_name}`
                ) );
            expect( result[0] ).toBeInstanceOf( Promise );
            expect( result[1] ).toBeInstanceOf( Promise );
            expect( ( await Promise.all( result ) ).map( arrayBuffer => Buffer.from( arrayBuffer ) ) ).toEqual( [ refTextFile_buffer, refJsonFile_buffer ] );
        } );
        it( "have a `toBuffer()` method that returns the contents as a buffer [FILE-TO-BUFFER]", async () => {
            const {result} = await( new Idl( `IDL=1 cmd [--option=${fn}] ${fn} :: default( $1.toBuffer(), option.toBuffer() )` )
                ._exec( 
                    ( $1, $2 ) => [ $1, $2 ],
                    `cmd ${refTextFile_name} --option=${refJsonFile_name}`
                ) );
            expect( result ).toEqual( [ refTextFile_buffer, refJsonFile_buffer ] );
        } );
        it( "have a `buffer()` method that promises the contents as text [FILE-BUFFER]", async () => {
            const {result} = await( new Idl( `IDL=1 cmd [--option=${fn}] ${fn} :: default( $1.buffer(), { buffer: option.buffer() } )` )
                ._exec( 
                    ( $1, {buffer} ) => [ $1, buffer ],
                    `cmd ${refTextFile_name} --option=${refJsonFile_name}`
                ) );
            expect( result[0] ).toBeInstanceOf( Promise );
            expect( result[1] ).toBeInstanceOf( Promise );
            expect( await Promise.all( result ) ).toEqual( [ refTextFile_buffer, refJsonFile_buffer ] );
        } );
        it( "have a `toText()` method that returns the contents as text [FILE-TO-TEXT]", async () => {
            const {result} = await( new Idl( `IDL=1 cmd [--option=${fn}] ${fn} :: default( $1.toText(), option.toText() )` )
                ._exec( 
                    ( $1, $2 ) => [ $1, $2 ],
                    `cmd ${refTextFile_name} --option=${refJsonFile_name}`
                ) );
            expect( result ).toEqual( [ refTextFile_text, refJsonFile_text ] );
        } );
        // Broken: because we currently unwrap it. 
        it( "have a `text()` method that promises the contents as text [FILE-TEXT]", async () => {
            const {result} = await( new Idl( `IDL=1 cmd [--option=${fn}] ${fn} :: default( $1.text(), { text: option.text() } )` )
                ._exec( 
                    ( $1, {text} ) => [ $1, text ],
                    `cmd ${refTextFile_name} --option=${refJsonFile_name}`
                ) );
            expect( result[0] ).toBeInstanceOf( Promise );
            expect( result[1] ).toBeInstanceOf( Promise );
            expect( await Promise.all( result ) ).toEqual( [ refTextFile_text, refJsonFile_text ] );
        } );
        it( "have a `toJSON()` method that returns the contents as json [FILE-TO-JSON]", async () => {
            const {result} = await( new Idl( `IDL=1 cmd [--option=${fn}] ${fn} :: default( $1.toJSON(), option.toJSON()  )` )
                ._exec( 
                    ( $1, $2 ) => [ $1, $2 ],
                    `cmd ${refJsonFile_name} --option=${refJsonFile_name}`
                ) );
            expect( result ).toEqual( [ refJsonFile_value, refJsonFile_value ] );
        } );
        it( "have a json() method you can wait on [FILE-JSON]", async () => {
            // NB The alternative is tested in the type realisation code.
            const {args} = await captureArgs( "cmd FILE :: default(await $1.json())", ['cmd',refJsonFile_name] );
            expect( args[0] ).toEqual( refJsonFile_value );
        } );
        it( "have a `toLines()` method that iterates over the contents as line [FILE-TO-LINES]", async () => {
            const {result} = await( new Idl( `IDL=1 cmd ${fn} :: default( $1.toLines() )` )
                ._exec( 
                    ( $1 ) => Array.from( $1 ).join( '\n' ) + '\n',
                    `cmd ${refTextFile_name}`
                ) );
            expect( JSON.stringify(result ) ).toEqual( JSON.stringify(refTextFile_text ) );
        } );
        it( "have a `toLines()` method that iterates over the contents as line [FILE-LINES]", async () => {
            const {result} = await( new Idl( `IDL=1 cmd ${fn} :: default( $1.lines() )` )
                ._exec( 
                    async ( $1 ) => {
                        let result = '';
                        for await ( const line of $1 ) {
                            result += line + '\n';
                        }
                        return result;
                    },
                    `cmd ${refTextFile_name}`
                ) );
            expect( JSON.stringify(result ) ).toEqual( JSON.stringify(refTextFile_text ) );
        } );
    } );
}

describe( "Inline options", () => {
    it( "should work when they are present", async () => {
        const {args} = await captureArgs( 
            "IDL=1 cmd [--salutation=STRING] :: default( @option greeting = 'hello', salutation = '' )",
            "cmd --greeting bonjour"
        );
        expect( args ).toEqual( ['bonjour', '' ] );
         
    } );
    it( "should be defaulted", async () => {
        const {args} = await captureArgs( 
            "IDL=1 cmd [--salutation=STRING] :: default( @option greeting = 'hello', salutation = '' )",
            "cmd --salutation=goodbye"
        );
        expect( args ).toEqual( ['hello', 'goodbye' ] );
         
    } );
    it( "should default boolean", async () => {
        const {args} = await captureArgs( 
            "IDL=1 cmd :: default( @option bonus = false  )",
            "cmd"
        );
        expect( args ).toEqual( [false] );
         
    } );
    it( "should allow true options to be set [@OPTION-TRUE]", async () => {
        const {args} = await captureArgs( 
            "IDL=1 cmd :: default( @option bonus = false  )",
            "cmd --bonus"
        );
        expect( args ).toEqual( [true] );
         
    } );
    it( "should allow false options to be set", async () => {
        const {args} = await captureArgs( 
            "IDL=1 cmd :: default( @option bonus = true  )",
            "cmd --no-bonus"
        );
        expect( args ).toEqual( [false] );
         
    } );
    it( "should be allowed to shadow an explicit option [@OPTION-SHADOW]", async () => {
        
        expect ( () => new Idl( "IDL=1 cmd [--count=COUNT] :: default( @option count )" ) )  
        .not.toThrow();
    } );
    it( "require a type when not shadowing the usage [@OPTION-TYPE]", async () => {
        expect ( () => new Idl( "IDL=1 cmd :: default( @option count )" ) )  
        .toThrowError( /^Inline-option .*? has no type/ );
    } );
} );

// FIXME: this is a test of the Usage, and belongs there.
it( "getCliMap should work", () => {
    const idl = new Idl( "IDL=1 cmd [--thing] [--no-thing] (-g|--give-away)=STRING [--value=STRING]... :: default({thing,giveAway,value})" );
    const usage = idl.getUsage();
    const map = usage.getCliMap( ); 
    for ( const {optionNames,platform} of usage.enumAllOptions() ) {
        if ( platform === "" )
            continue;
        // This is deleting from the actual map.
        for ( const o of optionNames ) {
            map.delete( o );
        }
    } 
    expect( map ).toEqual( new Map( [
        [ "--thing", new CliOption( {
            key: "thing",
            arg: ARGVALUE_NONE,
            impliedValue: true,
        } ) ],
        [ "--no-thing", new CliOption( {
            key: "thing",
            arg: ARGVALUE_NONE,
            impliedValue: false,
        } ) ],
        [ "--give-away", new CliOption({
            key: "giveAway",
            arg: ARGVALUE_REQUIRED,
            impliedValue: undefined,
        } ) ],
        [ "-g", new CliOption({
            key: "giveAway",
            arg: ARGVALUE_REQUIRED,
            impliedValue: undefined,
        } ) ],
        [ "--value", new CliOption({
            key: "value",
            arg: ARGVALUE_REQUIRED,
            impliedValue: undefined,
        } ) ],      
     ] ) );
} );

// 2024_8_10: There may be tests for this elsewhere - in getDictionary etc...
describe( "should handle multiple positionals (a [b [c] d] e)", () => {
    const API = "IDL=1 positionals INT1 [INT2 [INT3] INT4] INT5 :: default( $1, $5, $2 = -1, $4 = -1, $3 = -1 )";
    it( "reject 1 arg", async () => {
        await expectAsync( captureArgs( API, [ "positionals", "1" ] ) ).toBeRejectedWithError( StartsWith( 'Required at least 2' ) );
    } );
    it( "accept 2 args", async () => {
        const {args} = await captureArgs( API, [ "positionals", "1", "2" ] ) 
        expect( args ).toEqual( [ 1, 2, -1, -1, -1 ] );
    } );
    it( "reject 3 args", async () => {
        await expectAsync( captureArgs( API, [ "positionals", "1", "2", "3" ] ) ).toBeRejected();
    } );
    it( "accept 4 args", async () => {
        const {args} = await captureArgs( API, [ "positionals", "1", "2", "3", "4" ] ) 
        expect( args ).toEqual( [ 1, 4, 2, 3, -1 ] );
    } );
    it( "accept 5 args", async () => {
        const {args} = await captureArgs( API, [ "positionals", "1", "2", "3", "4", "5" ] ) 
        expect( args ).toEqual( [ 1, 5, 2, 4, 3 ] );
    } );
} );
 
describe( "integers should", () => {
    it( "have a typeof number for small integers", async () => {
        expect ( await captureOnlyArgs( "IDL=1 cmd INTEGER :: with () typeof $1", "cmd 45" ) )  
        .toEqual( "number" );
    } );
    it( "have a typeof bigint for large integers", async () => {
        expect ( await captureOnlyArgs( "IDL=1 cmd INTEGER :: with () typeof $1", "cmd 9117199254741991" ) )  
        .toEqual( "bigint" );
    } );
    // The Big Question is whether it should also equal 45n. But the IDL can't handle bigints so it's moot.
    it( "should be equal to constants", async () => {
        expect ( await captureOnlyArgs( "IDL=1 cmd INTEGER :: with () $1 === 45", "cmd 45" ) )  
        .toBeTrue();
    } );
    it( "should not equal itself", async () => {
        expect ( await captureOnlyArgs( "IDL=1 cmd INTEGER :: with () $1 !== $1", "cmd 45" ) )  
        .toBeFalse();
    } );
    it( "should realise as a number when safe", async () => {
        expect ( await captureOnlyArgs( "IDL=1 cmd INTEGER :: with () $1", "cmd 45" ) )  
        .toEqual( 45 );
    } );
    it( "should throw if unsafe", async () => {
        await expectAsync ( captureOnlyArgs( "IDL=1 cmd INTEGER :: with () $1", "cmd 9117199254741991" ) )  
        .toBeRejectedWithError(Error, StartsWith( "Integer is too big to be safely encoded" ) );
    } );
} );


