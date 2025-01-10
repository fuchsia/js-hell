import Instr from "../Instr.mjs";
import argtok from "./argtok.mjs";
import parseOptions from "./parseOptions.mjs";
import Usage_parse,{ERROR_ILLEGAL_SUFFIX} from "../usage/parse.mjs";
import Usage_build from "../usage/build.mjs";
import {realise} from "../bind/buildInvocation.mjs";
import StartsWith from "../utils/StartsWith.mjs";
import LexicalEnvironment from "./LexicalEnvironment.mjs";


    
// Q: Shouldn't we create an AST from the command-line and validate it in a later pass? 
// A: No. Because we allow `--key value` to indicate `--key=value` So we need to know whether
// key takes a value or is a boolean.  
//
// Q: Should this take the `LexicalEnvironment` as arg rather than this array of options?
function 
_getDictionary( usage, argstr, dummy, defaults = {} )    
    {
        const lexicalEnvironment = new LexicalEnvironment( usage, defaults );
        lexicalEnvironment.appendParsedOptions( usage.parseOptions( argstr ) );
        return lexicalEnvironment.finalise();  
    }

function getDictionary( usageString, args, autoRealise = true, defaultDictionary = {} )
    {
        const usage = Usage_build( Usage_parse( new Instr( usageString ), "" ) ); 
        const d = _getDictionary( usage, argtok( args ), {}, defaultDictionary );
        // Delete builitns supplied via getDictionary.
        delete d.cwd;
        delete d.expandGlobs;
        delete d.$LEXICAL_ENVIRONMENT$;
        if ( typeof d.recurse === 'undefined' )
            delete d.recurse;

        // 2024_10_3: There are now getters on the dictionary, so we can't use
        // the realise code as it assigns to the properties.
        return autoRealise ? realise( Object.assign( {}, d ) ) : d;
    }

// How many of these issues would be better served by being tests of the Idl? We can probe the same code paths from there.
describe( "getDictionary", () => {
    beforeEach(function() {
        jasmine.addCustomEqualityTester(( date1, date2 ) => { 
            if (  date1 instanceof Date && date2 instanceof Date ) {
                return +date1 === +date2;
            } 
        });
    });

    it( "should handle some booleans", () => {
        expect( getDictionary( "--some-big --no-thing", ["--some-big", "--no-thing"] ) ).toEqual( {someBig:true,thing:false,"$":[]} );
    } );

    it( "should throw if there is an unexpected option", () => {
        expect( () => getDictionary( "--some-big", ["--some-big", "--no-thing"] ) ).toThrow();
    } );
    it( "should throw if a mandatory boolean is missing", () => {
        expect( () => getDictionary( "--something-else --something-big", ["--something-else"] ) ).toThrow();
    } );
    it( "should handle a string without equals", () => {
        expect( getDictionary( "--value=STRING",  "--value hello" ) ).toEqual(  {value:'hello',"$":[]} );
    } );
    it( "should handle a string with equals", () => {
        expect( getDictionary( "--value=STRING",  "--value=hello" ) ).toEqual(  {value:'hello',"$":[]} );
    } );
    it( "should handle an integer", () => {
        expect( getDictionary( "--value=INT",  "--value 4" ) ).toEqual(  {value:4,"$":[]} );
    } );
    it( "should reject a non integer", () => {
        // {0..4}
        expect( () => getDictionary( "--value=INT",  "--value 4.5" ) ).toThrow();
    } );
    it( "should handle a date", () => {
        const d = Math.floor( Date.now() / 1000 ) * 1000;
        expect( getDictionary( "--start=DATE", [ "--start", (new Date( d ) ).toString() ] ) ).toEqual(  {start:new Date( d ),"$":[]} );
    } );
    it( "should reject a non date", () => {
        // Date.parse will parse some really silly things as dates - like pure numbers. We should be far less tolerant.
        expect( () => getDictionary( "--stop=DATE",  "--stop", "4 Ug" ) ).toThrow();
    } );
    it( "should reject a true-boolean with a value", () => {
        // Date.parse will parse some really silly things as dates - like pure numbers. We should be far less tolerant.
        expect( () => getDictionary( "--stop",  "--stop=4" ) ).toThrow();
    } );
    it( "should reject a false-boolean with a value", () => {
        // Date.parse will parse some really silly things as dates - like pure numbers. We should be far less tolerant.
        expect( () => getDictionary( "--no-stop",  "--no-stop=4" ) ).toThrow();
    } );
    describe( "should handle literal JSON", () => {
        it ( "array", () => {
            expect( getDictionary( "--value=JSON",  '--value="[5]"' ) ).toEqual(  {value:[5],"$":[]} );
        } );
        it ( "object", () => {
            expect( getDictionary( "--value=JSON",  "--value='  {\"hello\":4}'" ) ).toEqual(  {value:{hello:4},"$":[]} );
        } );
        it ( "positive number", () => {
            expect( getDictionary( "--value=JSON",  "--value='  4'" ) ).toEqual(  {value:4,"$":[]} );
        } );
        it ( "negative number", () => {
            expect( getDictionary( "JSON",  " '  -0.2'" ) ).toEqual(  {"$0": -0.2, "$json": -0.2, "$":[-0.2],JSON:-0.2} );
        } );
        it ( "true", () => {
            expect( getDictionary( "JSON",  "true" ) ).toEqual(  {"$0": true, "$json": true,"$":[true],JSON: true} );
        } );
        it ( "false", () => {
            expect( getDictionary( "--json=JSON",  "--json=false  " ) ).toEqual(  {"$":[],json:false} );
        } );
        it ( "null", () => {
            expect( getDictionary( "--value=JSON",  "--value='  null'" ) ).toEqual(  {value:null,"$":[]} );
        } );
    } );
    
    describe( "when processsing literals", () => {
        it( "should throw if a literal is not matched", () => {
            // Date.parse will parse some really silly things as dates - like pure numbers. We should be far less tolerant.
            expect( () => getDictionary( "hello",  "goodbye" ) ).toThrow();
        } );
        it( "should pass a literal", () => {
            const res = getDictionary( "hello",  "hello" );
            expect( res ).toEqual(  {"$":["hello"],$0:"hello"} );
        } );
    } );
    describe( "when processing positionals", () => {
        it( "should correctly assign the type", () => {
            expect( getDictionary( "INT STRING DATE INT", [ "4", "hello", "May 2022", "22" ] ) ).toEqual(  {
                $:[4, "hello", new Date( Date.parse( "May 2022" ) ), 22],
                $0: 4,
                $1: "hello",
                $2: new Date( Date.parse( "May 2022" ) ),
                $3: 22, 
                $date: new Date( Date.parse( "May 2022" ) ),
                // FIXME: we should match the one the user uses. So, in the above, it should be `$string`
                $string: "hello",
                DATE: new Date( Date.parse( "May 2022" ) ),
                STRING: "hello", 
                // NB NO int 
            } );
        } );
        it( "should be able to mix aliases", () => {
            expect( getDictionary( "STR STRING NAME TEXT", [ "one", "two", "three", "four" ] ) ).toEqual(  {
                $:[ "one", "two", "three", "four" ],
                $0: "one",
                $1: "two",
                $2: "three",
                $3: "four", 
                $str: "one",
                STR: "one",
                $string: "two",
                STRING: "two",
                $name: "three",
                NAME: "three",
                $text: "four",
                TEXT: "four", 
            } );
        } );
        it( "should throw on an invalid type", () => {
            expect( () => getDictionary( "INT STRING DATE INT", [ "4", "hello", "May 2022", "fred" ] ) ).toThrow();
        } );
        it( "should handle a recurring tail", () => {
            expect( getDictionary( "COUNT...", "4 5 6" ) ).toEqual(  {"$":[[4, 5, 6]], $counts: [ 4, 5, 6 ], COUNT: [4,5,6], $0: [ 4, 5, 6 ]} );
        } );
        it( "should throw if invalid type in recurring", () => {
            expect( () => getDictionary( "INT...", "4 hello" ) ).toThrow();
        } );
        // ${get-projectdir project.json} `${[]}` 
        it( "should accept an initial list", () => {
            // Q: Should `$` be `[4,5,6]`?
            expect( getDictionary( "INT... INT", "4 5 6" ) ).toEqual(  {"$":[[4, 5], 6], $0: [ 4, 5 ], $1: 6 } );
        } );
        it( "should accept an initial empty list", () => {
            // To support an empty list we should require `[INT...] INT` or `[INT]... INT`;
            // for the moment, it has to be the former.
            expect( () => getDictionary( "cmd INT... INT", "cmd 6" ) ).toThrowError( Error, /^Required 2/ );
        } );
        it( "should throw if too many positionals", () => {
            expect( () => getDictionary( "INT", "4 5"  ) ).toThrow();
        } );
        it( "should throw if not enough positionals", () => {
            expect( () => getDictionary( "cmd INT INT", "cmd 4" ) ).toThrowError(Error, /^Required 2 arguments/);
        } );
        it( "a single trailing argument can be elided", () => {
            expect( getDictionary( "INT [INT]", "4" ) ).toEqual(  {"$":[4], $0: 4 } )
        } );
        it( "a single edlidable trailing argument can be present", () => {
            expect( getDictionary( "INT [INT]", "4 4" ) ).toEqual(  {"$":[4,4], $0: 4, $1: 4 } )
        } );
        it( "a single leading argument can be elided", () => {
            expect( getDictionary( "[INT] INT", "4" ) ).toEqual(  {"$":[4], $1: 4 } )
        } );
        it( "a single leading argument can be present", () => {
            expect( getDictionary( "[INT] INT", "4 4" ) ).toEqual(  {"$":[4,4], $0: 4, $1: 4 } )
        } );
        it( "a single, elidable leading argument can be present", () => {
            expect( getDictionary( "[INT] INT", "5 4" ) ).toEqual(  {"$":[5,4], $0: 5, $1: 4 } )
        } );
        it( "a single medial argument can be elided", () => {
            expect( getDictionary( "INT [INT] INT", "0 4" ) ).toEqual(  {"$":[0,4], $0: 0, $2: 4 } )
        } );
        it( "a single, elidable medial argument can be present", () => {
            expect( getDictionary( "INT [INT] INT", "5 4 3" ) ).toEqual(  {"$":[5,4,3], $0: 5, $1: 4, $2: 3 } )
        } );
        it( "the shortest expansion of a nested elidable works", () => {
            expect( getDictionary( "INT [INT [INT]] INT", "5 3" ) ).toEqual(  {"$":[5,3], $0: 5, $3: 3 } )
        } );
        it( "the second expansion of a nested elidable works", () => {
            expect( getDictionary( "INT [INT [INT]] INT", "5 4 3" ) ).toEqual(  {"$":[5,4, 3], $0: 5, $1: 4, $3: 3 } )
        } );
        it( "the fullest expansion of a nested elidable works", () => {
            expect( getDictionary( "INT [INT [INT]] INT", "5 4 1 3" ) ).toEqual(  {"$":[5,4,1, 3], $0: 5, $1: 4, $2: 1, $3: 3 } )
        } );
        it( "a multi element expansion should work when fuly expanded", () => {
            expect( getDictionary( "INT [STR STR] INT", "5 4 1 3" ) ).toEqual(  {"$":[5,'4','1', 3], $0: 5, $1: '4', $2: '1', $3: 3 } )
        } );
        it( "a multi element expansion should work when fully contracted", () => {
            expect( getDictionary( "INT [STR STR] INT", "5 4" ) ).toEqual(  {"$":[5,4], $0: 5, $3: 4 } )
        } );
        it( "should refuse to handle an ambiguous elision", () => {
            expect( () => getDictionary( "[INT] [INT] INT", "5 4 3" ) ).toThrowError( Error, 
                /^unexpected `\[` \(only one/ ); 
        } );
        it( "should refuse to handle an ambiguous nested elision when spread out", () => {
            expect( () => getDictionary( "[INT [INT] INT [INT] INT] INT", "5 4 3" ) ).toThrowError( Error, 
                /^unexpected `\[` \(only one/ ); 
        } );
        
    } );
    it( "should pass an integer subtype", () => {
        expect( getDictionary( "BYTE_COUNT", "24" ) ).toEqual(  {"$":[24],$0:24,$byteCount:24,BYTE_COUNT:24} );
    } );
    describe( "when faced with a repeated", () => {
        it( "boolean", () => {
            expect( getDictionary( "[--verbose]...", "--verbose --verbose --verbose" ) ).toEqual( {"$":[],verbose:3} );
        } );
        it( "string", () => {
            expect( getDictionary( "[--include=STR]...", "--include=*.x --include=*.y" ) ).toEqual( {"$":[],include:["*.x","*.y"]} );
        } );
        it( "type requiring instantiate", () => {
            expect( getDictionary( "[--cutoff=INT]...", "--cutoff=4 --cutoff=12" ) ).toEqual( {"$":[],cutoff:[4,12]} );
        } );
        it( "singular option", () => {
            expect( () => getDictionary( "[--unique=STR]", "--unique=sui --unique=generis" ) ).toThrowError( /^Cannot repeat option "--unique"/ );
        } );
        it( "missing instantiatable option", () => {
            expect( getDictionary( "[--cutoff=INT]...", "" ) ).toEqual( {"$":[],cutoff:[]} );
        } );
        it( "missing boolean", () => {
            expect( getDictionary( "[--verbose]...", "" ) ).toEqual( {"$":[],verbose:0} );
        } );
        it( "missing defaulted boolean", () => {
            expect( getDictionary( "[--verbose]...", "", true, {verbose: 4} ) ).toEqual( {"$":[],verbose:4} );
        } );
        it( "missing defaulted string", () => {
            expect( getDictionary( "[--exclude=GLOB]...", "", true, {exclude: ".*"} ) ).toEqual( {"$":[],exclude:".*"} );
        } );
    } );
    describe( "should handle a short option", () => {
        it( "that's a bool", () => {
            expect( getDictionary( "[(--verbose|-v)]", "-v" ) ).toEqual( {"$":[],verbose:true} );
        } );
        it( "that's a count", () => {
            expect( getDictionary( "[(--verbose|-v)]...", "-vvv" ) ).toEqual( {"$":[],verbose:3} );
        } );
        it( "that takes an immediate value", () => {
            expect( getDictionary( "(--something|-s)=STRING", "-stext" ) ).toEqual( {"$":[],something:'text'} );
        } );
        it( "that takes an equals value", () => {
            expect( getDictionary( "(--something|-s)=STRING", "-s=text" ) ).toEqual( {"$":[],something:'text'} );
        } );
        it( "that takes a spaced value", () => {
            expect( getDictionary( "(--something|-s)=STRING", "-s text" ) ).toEqual( {"$":[],something:'text'} );
        } );
        it( "that takes a multitide of values", () => {
            expect( getDictionary( "(--something|-s)=STRING [(--verbose|-v)]...", "-vsvex -vv" ) ).toEqual( {"$":[],something:'vex',verbose:3} );
        } );
        it( "should handle an unknown option in the stack", () => {
            expect( () => getDictionary( "[(--verbose|-v)]...", "-vo" ) ).toThrowError( Error, 'Unknown option "-o"' );
        } );
        it( "should handle an used =values", () => {
            expect( () => getDictionary( "[(--verbose|-v)]...", "-v=4" ) ).toThrowError( Error, 'Cannot set a value for -v' );
        } );
    } );
    describe( "when faced with a suffixed type", () => {
        it( "should accept a simple case", () => {
            expect( getDictionary( "STRING1 STRING2", "hello world" ) ).toEqual( {"$":["hello", "world"],$0:"hello", $1:"world", $string1: "hello", $string2: "world",STRING1: "hello", STRING2: "world"} );
        } );
        it( "should reject suffixed lists", () => {
            expect( () => getDictionary( "STRING1...", "hello world" ) ).toThrowError( Error, StartsWith( ERROR_ILLEGAL_SUFFIX ) )
        } );
        it( "should reject suffixed options", () => {
            expect( () => getDictionary( "--value=STRING1", "--value=hello" ) ).toThrowError( Error, StartsWith( ERROR_ILLEGAL_SUFFIX ) )
        } );
        it( "should handle duplicate suffix", () => {
            // FIXME: definitely make this illegal. 
            expect( () => getDictionary( "STRING1 STRING1", "hello world" ) ).toThrowError( Error,
                StartsWith( `duplicate String suffix '1'` )  );
        } );
    } );
    
    it( "should do basic lookups", () => {
        expect( getDictionary( "INTEGER", "${value}", undefined, { value: 10 } ) ).toEqual( {"$":[10],$0:10, $integer: 10, INTEGER: 10, value: 10} );
    } );
    it( "should instantiate env lookups", () => {
        expect( getDictionary( "INTEGER", "${env.FOO}", undefined, { env: {FOO: "12"} } ) ).toEqual( {"$":[12],$0:12, $integer: 12, INTEGER: 12, env: { FOO: "12" } } );
    } );
} );
    