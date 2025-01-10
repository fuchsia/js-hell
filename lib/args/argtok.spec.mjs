import argtok,{ ARG_POSITIONAL_VALUE, ARG_NAMED_VALUE, ARG_NAME, ARG_OPERATOR,INFO_NONE,INFO_HASVALUE,INFO_QUOTED,FILE_TOPIC, ARG_POSITIONAL_EXPR, ARG_NAMED_EXPR, RE_OPERATOR, parseArray} from "./argtok.mjs";
import StartsWith from "../utils/StartsWith.mjs";

function 
toPositional( ...array )
    {
        return array.map( value => ({type:ARG_POSITIONAL_VALUE,value, info: INFO_NONE}) );
    }

describe( "argtok( text )", () => {
    it( "should pass a single item", () => {
        expect( Array.from( argtok( "hello" ) ) ).toEqual( [{type:ARG_POSITIONAL_VALUE,value: 'hello', info: INFO_NONE}]);
    } );
    it( "should pass a windows file", () => {
        expect( Array.from( argtok( "c:\\dir\\*.txt" ) ) ).toEqual( [{type:ARG_POSITIONAL_VALUE,value: "c:\\dir\\*.txt", info: INFO_NONE}]);
    } );
    it( "should pass a windows file that ends with a backslash [ARGTOK-BACKSLASH-DQ]", () => {
        expect( Array.from( argtok( `"\\\\server\\share\\some dir\\"` ) ) ).toEqual( [{type:ARG_POSITIONAL_VALUE,value: `\\\\server\\share\\some dir\\`, info: INFO_QUOTED}]);
    } );
    it( "should pass a windows file that ends with a backslash [ARGTOK-BACKSLASH-SQ]", () => {
        expect( Array.from( argtok( `'\\\\server\\share\\some dir\\'` ) ) ).toEqual( [{type:ARG_POSITIONAL_VALUE,value: `\\\\server\\share\\some dir\\`, info: INFO_QUOTED}]);
    } );
    for ( const special of "!?$%^=@#~()[]{}<>&|,;`'\"" ) {
        RE_OPERATOR.lastIndex = 0;
        // FIXME: we should check these cases generate operators.
        if ( RE_OPERATOR.test( special ) ) {
            it( `should spot special ${special} is an operator [ARGTOK-SPECIAL-LEGAL]`, () => {
                expect( Array.from( argtok( "cmd " + special ) ) ).toEqual( [{type:ARG_POSITIONAL_VALUE,value: `cmd`, info: INFO_NONE}, {type:ARG_OPERATOR, value:special,info: INFO_NONE} ] );
            } );
        } else if ( special === '`' ) {
            xit( `should issue an error on a lone ${special} [ARGTOK-SPECIAL-ILLEGAL]`, () => {} ); 
        } else { 
            it( `should issue an error on a lone ${special} [ARGTOK-SPECIAL-ILLEGAL]`, () => {
                expect( () => Array.from( argtok( "cmd " + special ) ) ).toThrowError( Error, /^Illegal character / );
            } );
        } 
    }
    it( "should tokenise two items", () => {
        expect( Array.from( argtok( "do something" ) ) ).toEqual( [{type:ARG_POSITIONAL_VALUE,value: "do", info: INFO_NONE},{type:ARG_POSITIONAL_VALUE,value: "something", info: INFO_NONE}]);
    } );
    it( "should tokenise items that cross a line boundary", () => {
        expect( Array.from( argtok( "first\r second \n  third\r\nfourth" ) ) ).toEqual( toPositional(  "first","second","third","fourth" ));
    } );
    it( "should trim", () => {
        expect( Array.from( argtok( " do   something   " ) ) ).toEqual( [{type:ARG_POSITIONAL_VALUE,value: "do",info: INFO_NONE},{type:ARG_POSITIONAL_VALUE,value: "something",info: INFO_NONE}]);
    } );
    it( "should handle a single, double quoted string", () => {
        expect( Array.from( argtok( '"&$&^$&\\\' --="' ) ) ).toEqual( [{type:ARG_POSITIONAL_VALUE,value: "&$&^$&\\\' --=", info: INFO_QUOTED}]);
    } );
    it( "should handle a single, a single quoted string", () => {
        expect( Array.from( argtok( "'&$&^$&\\\"| --='" ) ) ).toEqual( [{type:ARG_POSITIONAL_VALUE,value: '&$&^$&\\\"| --=', info: INFO_QUOTED}]);
    } );
    it( "quoting should crosss lines", () => {
        expect( Array.from( argtok( "'1\r2\n3\r\n4'" ) ) ).toEqual( [{type:ARG_POSITIONAL_VALUE,value: '1\r2\n3\r\n4', info: INFO_QUOTED}]);
    } );
    it( "handle a lone option", () => {
        expect( Array.from( argtok( "--hello-world" ) ) ).toEqual( [{type:ARG_NAME,value: '--hello-world',info: INFO_NONE}]);
    } );
    it( "handle an option with bareword value", () => {
        expect( Array.from( argtok( "--hello=world " ) ) ).toEqual( [{type:ARG_NAME,value: '--hello',info: INFO_HASVALUE},{type:ARG_NAMED_VALUE,value: 'world',info: INFO_NONE}]);
    } );
    it( "handle an option a string value", () => {
        expect( Array.from( argtok( "--hello=''" ) ) ).toEqual( [{type:ARG_NAME,value: '--hello',info: INFO_HASVALUE},{type:ARG_NAMED_VALUE,value: '',info: INFO_QUOTED}]);
    } );
    it( "should stop argument processing", () => {
        expect( Array.from( argtok( "--something -- --else" ) ) ).toEqual( [{type:ARG_NAME,value: '--something',info: INFO_NONE},{type:ARG_POSITIONAL_VALUE,value: '--else',info: INFO_NONE}]);
    } );
    it( "should throw if it encounters a magical char", () => {
        expect( () => Array.from( argtok( "Teal'c" ) ) ).toThrowError( Error, "expected whitespace at 4");
    } );
    it( "shouldn't need whitespace around operators", () => {
        expect( Array.from( argtok( "start&&stop" ) ) ).toEqual( [{type:ARG_POSITIONAL_VALUE, value:"start",info: INFO_NONE},{type:ARG_OPERATOR, value:"&&",info: INFO_NONE},{type:ARG_POSITIONAL_VALUE, value:"stop",info: INFO_NONE}] ); 
    } );
    it( "should spot a lone dash - in a string [STRTOK-FILETOPIC]", () => {
        expect( Array.from( argtok( "cmd - '-' input - -- - " ) ) ).toEqual( [{type:ARG_POSITIONAL_VALUE,value: 'cmd',info: INFO_NONE},{type:ARG_POSITIONAL_VALUE,value: FILE_TOPIC,info: INFO_NONE},
            { type: ARG_POSITIONAL_VALUE, value: FILE_TOPIC,info: INFO_QUOTED}, { type: ARG_POSITIONAL_VALUE, value: "input",info: INFO_NONE},{type:ARG_POSITIONAL_VALUE,value: FILE_TOPIC,info: INFO_NONE}, 
            { type: ARG_POSITIONAL_VALUE, value: "-",info: INFO_NONE}]);
        
    } );
    it( "should spot a lone dash - in an array [ARRAYTOK-FILETOPIC]", () => {
        expect( Array.from( argtok( ["cmd", "-", "input", "--", "-" ] ) ) ).toEqual( [{type:ARG_POSITIONAL_VALUE,value: 'cmd',info: INFO_NONE},{type:ARG_POSITIONAL_VALUE,value: FILE_TOPIC,info: INFO_NONE},
            { type: ARG_POSITIONAL_VALUE, value: "input",info: INFO_NONE}, { type: ARG_POSITIONAL_VALUE, value: "-",info: INFO_NONE}]);
        
    } );
    // 2024_11_15: This should be true for all operators - see the specials tests above.
    it( "should spot operator> without space", () => {
        expect( Array.from( argtok( "cmd>file" ) ) ).toEqual( [{type:ARG_POSITIONAL_VALUE, value:"cmd",info: INFO_NONE},{type:ARG_OPERATOR, value:">",info: INFO_NONE},{type:ARG_POSITIONAL_VALUE, value:"file",info: INFO_NONE}] );
    } );
    it( "should spot operator>> with space", () => {
        expect( Array.from( argtok( "cmd >> file" ) ) ).toEqual( [{type:ARG_POSITIONAL_VALUE, value:"cmd",info: INFO_NONE},{type:ARG_OPERATOR, value:">>",info: INFO_NONE},{type:ARG_POSITIONAL_VALUE, value:"file",info: INFO_NONE}] );
    } );
} );

/*xdescribe( "argtok( [args] )", () => {
    // FIXME: there should be tests in here.
} )*/

// Can't be in the above as we are sometimes an array.
describe( "argtok(), when handling an expression,", () => {
    describe( "in an array,", () => { 
        it( "should spot it as a positional", () => {
            expect( Array.from( argtok( ["cmd", "${ thing }" ] ) ) ).toEqual( [{type:ARG_POSITIONAL_VALUE,value: 'cmd',info: INFO_NONE},{type:ARG_POSITIONAL_EXPR,value: " thing ",info: INFO_NONE},]);
        } );
        // Q: Should we flag this as an error? 
        it( "should not count a positional without a trailing ket", () => {
            expect( Array.from( argtok( ["cmd", "${ thing" ] ) ) ).toEqual( [{type:ARG_POSITIONAL_VALUE,value: 'cmd',info: INFO_NONE},{type:ARG_POSITIONAL_VALUE,value: "${ thing",info: INFO_NONE},]);
        } );
        it( "should support it as an arg", () => {
            expect( Array.from( argtok( ["cmd", "--foo=${bar}" ] ) ) ).toEqual( [{type:ARG_POSITIONAL_VALUE,value: 'cmd',info: INFO_NONE},{type:ARG_NAME,value: '--foo',info: INFO_HASVALUE},{type:ARG_NAMED_EXPR,value: "bar",info: INFO_NONE},]);
        } );
        it( "should spot a template string literal", () => {
            // Ideally we would turn it into a literals string; the parseTexgt does.
            expect( Array.from( argtok( ["cmd", "`hello world`" ] ) ) ).toEqual( [{type:ARG_POSITIONAL_VALUE,value: 'cmd',info: INFO_NONE},{type:ARG_POSITIONAL_VALUE,value: "hello world",info: INFO_QUOTED},]);
        } );
        it( "should spot a template string with embedded expansions", () => {
            expect( Array.from( argtok( ["cmd", "`2 + 3 = ${Math.sum(2,3)}`" ] ) ) ).toEqual( [{type:ARG_POSITIONAL_VALUE,value: 'cmd',info: INFO_NONE},{type:ARG_POSITIONAL_EXPR,value: "`2 + 3 = ${Math.sum(2,3)}`",info: INFO_NONE},]);
        } );
        it( "should object to a broken string", () => {
            // FIXME: This is a horrible error message. It comes from the parser and we need to fix it. But
            // at least it throws.
            expect( () => Array.from( argtok( ["cmd", "`hello` + `world`" ] ) ) )
            .toThrowError( Error, StartsWith( "expected argument end" ));
        } );
    } );
    describe( "in a string,", () => { 
        it( "should spot it as a positional", () => {
            expect( Array.from( argtok( "cmd ${thing}" ) ) ).toEqual( [{type:ARG_POSITIONAL_VALUE,value: 'cmd',info: INFO_NONE},{type:ARG_POSITIONAL_EXPR,value: "thing",info: INFO_NONE},]);
        } );
        
        it( "should count an expression that includes spaces", () => {
            expect( Array.from( argtok( "cmd ${ thing } arg" ) ) )
            .toEqual( [{type:ARG_POSITIONAL_VALUE,value: 'cmd',info: INFO_NONE},{type:ARG_POSITIONAL_EXPR,value: 'thing',info: INFO_NONE},{type:ARG_POSITIONAL_VALUE,value: "arg",info: INFO_NONE},] );
        } );
        it( "should support it as an arg", () => {
            expect( Array.from( argtok( "cmd --foo=${bar}" ) ) ).toEqual( [{type:ARG_POSITIONAL_VALUE,value: 'cmd',info: INFO_NONE},{type:ARG_NAME,value: '--foo',info: INFO_HASVALUE},{type:ARG_NAMED_EXPR,value: "bar",info: INFO_NONE},]);
        } );
        it( "should spot a template string literal", () => {
            // Ideally we would turn it into a literals string; the parseTexgt does.
            expect( Array.from( argtok( "cmd `hello world`" ) ) ).toEqual( [{type:ARG_POSITIONAL_VALUE,value: 'cmd',info: INFO_NONE},{type:ARG_POSITIONAL_VALUE,value: "hello world",info: INFO_QUOTED},]);
        } );
        it( "should spot a template string with embedded expansions", () => {
            expect( Array.from( argtok( "cmd `2 + 3 = ${Math.sum(2,3)}`" ) ) ).toEqual( [{type:ARG_POSITIONAL_VALUE,value: 'cmd',info: INFO_NONE},{type:ARG_POSITIONAL_EXPR,value: "`2 + 3 = ${Math.sum(2,3)}`",info: INFO_NONE},]);
        } );
    } );
} );

