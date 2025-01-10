import Instr from "../instr.mjs";
import StartsWith from "../utils/StartsWith.mjs";
import {default as default_parse, _parse,ERROR_EXPECTED_SCRIPTLET_NAME,ERROR_EXPECTED_VALUE,ERROR_EXPECTED_WS,ERROR_INVALID_VERSION} from "./parse.mjs";

function parse( text ) {
    return _parse( new Instr( text ) );
}

function parse3( text ) {
    return default_parse( text, { extractName: true} );
}


describe( "The environment parser should", () => {
    it ( "parse a string without vars", () => {
        expect ( parse3( "IDL=1 some command here" ) ).toEqual(  {
            idl: " command here",
            name: "some",
            api: 1
        } );
    } );
    it ( "not object to out-dated API=x syntax", () => {
        expect ( parse3( "API=1 some command here" ) ).toEqual(  {
            idl: " command here",
            name: "some",
            api: 1
        } );
    } );
    it ( "handle minor versions", () => {
        expect ( parse3( "IDL=1b some" ) ).toEqual(  {
            idl: "",
            name: "some",
            api: 1 + 2 / 100
        } );
    } );
    it ( "reject a two char version", () => {
        expect( () => parse3( `IDL=2aa cmd` ) ).toThrowError( 
            Error,
            StartsWith( ERROR_INVALID_VERSION )
         );
    });
    it ( "reject a dotted version", () => {
        expect( () => parse3( `IDL=2.4 cmd` ) ).toThrowError( 
            Error,
            StartsWith( ERROR_INVALID_VERSION )
         );
    });
    it ( "parse numeric variables version", () => {
        expect ( parse3( "IDL=20 VXX=1 some command here" ) ).toEqual(  {
            idl: " command here",
            vxx: 1,
            name: "some",
            api: 20,
        } );
    } );
    it ( "parse a text var", () => {
        expect ( parse3( "IDL=1 CONF=thing some command here" ) ).toEqual(  {
            idl: " command here",
            conf: "thing",
            name: "some",
            api: 1
        } );
    } );
    it ( "parse a snake_case var", () => {
        expect ( parse3( "IDL=1 OUTPUT_FORMAT=psv some command here" ) ).toEqual(  {
            idl: " command here",
            outputFormat: "psv",
            name: "some",
            api: 1
        } );
    } );
    it ( "parse multiple vars", () => {
        expect ( parse3( "IDL=20 V_I=2 CONF=thing some command here" ) ).toEqual(  {
            idl: " command here",
            conf: "thing",
            vI: 2,
            name: "some",
            api: 20
        } );
    } );
    it ( "object to non-textual/numeric values", () => {
        // FIXME: should check the message.
        expect ( () => parse3( "IDL=1 THING=x,y some command here" ) ).toThrow();
    } );
    it ( "support single quoted values", () => {
        // FIXME: should check the message.
        expect ( parse3( "IDL=1 THING='x,y' some command here" ) ).toEqual( {
            idl: " command here",
            thing: "x,y",
            name: "some",
            api: 1
        } );
    } );
    it ( "reject single quoted values if they aren't followed by WS", () => {
        // FIXME: should check the message.
        expect ( () => parse3( "IDL=1 THING='x,y'some command here" ) ).toThrow();
    } );
    it ( "object to a var called 'idl'", () => {
        // FIXME: should check the message.
        expect ( () => parse3( "IDL=1 IDL=x some command here" ) ).toThrow();
    } );
    for ( const [name,id] of Object.entries( { "an ordinary name": "some", "$0": "$0"} ) ) {
        it ( `terminate ${name} at ' '`, () => {
            // FIXME: should check the message.
            expect ( parse3( `IDL=1 ${id} ::command here` ) ).toEqual( {
                idl: " ::command here",
                name: id,
                api: 1
            } );
        } );
        it ( `terminate ${name} at '::'`, () => {
            expect ( parse3( `IDL=1 ${id}::command here` ) ).toEqual( {
                idl: "::command here",
                name: id,
                api: 1
            } );
        } );
        it ( `terminate ${name} at eof`, () => {
            expect ( parse3( `IDL=1 ${id}` ) ).toEqual( {
                idl: "",
                name: id,
                api: 1
            } );
        } );
        it ( `not use a name with magic characters ${name} `, () => {
            expect ( parse3( `IDL=1 ${id} ${id}[]` ) ).toEqual( {
                idl: ` ${id}[]`,
                name: id,
                api: 1
            } );
        } );
    }
    describe( "throw on a missing value:", () => {
        it ( "`VAR= `", () => {
            expect ( () => parse3( `IDL=2 VAR= ` ) ).toThrowError( 
                Error,
                StartsWith( ERROR_EXPECTED_VALUE )
             );
        } );
        it ( "`VAR=::`", () => {
            expect ( () => parse3( `IDL=2 VAR=::` ) ).toThrowError( 
                Error,
                StartsWith( ERROR_EXPECTED_VALUE )
             );
        } );
        it ( "`VAR=`", () => {
            expect ( () => parse3( `IDL=2 VAR=` ) ).toThrowError( 
                Error,
                StartsWith( ERROR_EXPECTED_VALUE )
             );
        } );
    } );
    
    describe( "throw on a missing name", () => {
        it( "where the first non-var is an option", () => {
            expect ( () => parse3( `IDL=2 X=2 --name name` ) ).toThrowError( 
                Error,
                StartsWith( ERROR_EXPECTED_SCRIPTLET_NAME )
             );
        } );
        
        it( "where there is a numeric var and no name", () => {
            // Is this the error we want?
            expect ( () => parse3( `IDL=2 X=2::something` ) ).toThrowError( 
                Error,
                StartsWith( ERROR_EXPECTED_SCRIPTLET_NAME )
             );
        } );
        it( "where there is a bareword var and no name", () => {
            // Is this the error we want?
            expect ( () => parse3( `IDL=2 X=text::something` ) ).toThrowError( 
                Error,
                StartsWith( ERROR_EXPECTED_SCRIPTLET_NAME )
             );                                   
        } );
        it( "where there is a quoted var and no name", () => {
            // Is this the error we want?
            expect ( () => parse3( `IDL=2 X="text"::something` ) ).toThrowError( 
                Error,
                StartsWith( ERROR_EXPECTED_SCRIPTLET_NAME )
             );
        } );
        it( "where '::' immediately follows API", () => {
            expect ( () => parse3( `IDL=2::something` ) ).toThrowError( 
                Error,
                StartsWith( ERROR_EXPECTED_SCRIPTLET_NAME )
             );
        } );
        it( "where '::' follows the API after a space", () => {
            // Again, is this a hlepful error?
            expect ( () => parse3( `IDL=2 ::something` ) ).toThrowError( 
                Error,
                StartsWith( ERROR_EXPECTED_SCRIPTLET_NAME )
             );
        } );
    } );

    describe( "handle an annotation", () => {
        it( "when it is a single line and there is NO var", () => {
            expect ( parse3( `IDL=1 -- something\n cmd :: rest` ) ).toEqual( {
                idl: " :: rest",
                name: "cmd",
                summary: " something\n",
                details: [],
                api: 1
            } );
        } );
        it( "when it is a single line and there is a var", () => {
            expect ( parse3( `IDL=1 -- something\nVXX=hello cmd :: rest` ) ).toEqual( {
                idl: " :: rest",
                vxx: "hello",
                name: "cmd",
                summary: " something\n",
                details: [],
                api: 1
            } );
        } );
        it( "when it is multiple lines and there is NO var", () => {
            expect ( parse3( `IDL=1 -- something\n-- continues\n cmd :: rest` ) ).toEqual( {
                idl: " :: rest",
                name: "cmd",
                summary: " something\n continues\n",
                details: [],
                api: 1
            } );
        } );
        it( "when it is multiple lines and there is a var", () => {
            expect ( parse3( `IDL=1 -- something\n-- continues\nOUTPUT_FORMAT=json cmd :: rest` ) ).toEqual( {
                idl: " :: rest",
                outputFormat: "json",
                name: "cmd",
                summary: " something\n continues\n",
                details: [],
                api: 1
            } );
        } );
        it( "when it has two comment-separated paragraphs and there is NO var", () => {
            expect ( parse3( `IDL=1 -- something\n-- continues\n--\n-- Another para \ncmd :: rest` ) ).toEqual( {
                idl: " :: rest",
                name: "cmd",
                summary: " something\n continues\n",
                details: [" Another para \n"],
                api: 1
            } );
        } );
        it( "when it has two comment-separated paragraphs and there is a var", () => {
            expect ( parse3( `IDL=1 -- something\n-- continues\n--\n-- Another para \nVAR=whatever cmd :: rest` ) ).toEqual( {
                idl: " :: rest",
                var: "whatever",    
                name: "cmd",
                summary: " something\n continues\n",
                details: [" Another para \n"],
                api: 1
            } );
        } );
        it( "when it has two blank-separated paragraphs and there is NO var", () => {
            expect ( parse3( `IDL=1 -- something\n-- continues\n\n-- Another para \ncmd :: rest` ) ).toEqual( {
                idl: " :: rest",
                name: "cmd",
                summary: " something\n continues\n",
                details: [" Another para \n"],
                api: 1
            } );
        } );
        it( "when it has two blank-separated paragraphs and there is a var", () => {
            
            expect ( parse3( `IDL=1 -- something\n-- continues\n\n-- Another para \nVAR=whatever cmd :: rest` ) ).toEqual( {
                idl: " :: rest",
                var: "whatever",    
                name: "cmd",
                summary: " something\n continues\n",
                details: [" Another para \n"],
                api: 1
            } );
            
        } );
        it( "when it has two blank-and-space-separated paragraphs and there is NO var", () => {
            expect ( parse3( `IDL=1 -- something\n-- continues\n \t \n-- Another para \ncmd :: rest` ) ).toEqual( {
                idl: " :: rest",
                name: "cmd",
                summary: " something\n continues\n",
                details: [" Another para \n"],
                api: 1
            } );
        } );
        it( "when it has two blank-and-space-separated paragraphs and there is a var", () => {
            expect ( parse3( `IDL=1 -- something\n-- continues\n   \n-- Another para \nVAR=whatever cmd :: rest` ) ).toEqual( {
                idl: " :: rest",
                var: "whatever",    
                name: "cmd",
                summary: " something\n continues\n",
                details: [" Another para \n"],
                api: 1
            } );
        } );
        it( "and throw if we hit eof", () => {
            expect ( () => parse3( `IDL=1 -- something\n--` ) ).toThrowError( 
                Error,
                StartsWith( ERROR_EXPECTED_SCRIPTLET_NAME )
            );
        } );
        it( "and throw when no space after annotation", () => {
            expect ( () => parse3( `IDL=1 --something\n cmd :: default()` ) ).toThrowError( 
                Error,
                StartsWith( ERROR_EXPECTED_WS )
            );
        } );
        it( "when it is attached to the cmd", () => {
            expect ( parse3( `IDL=1 cmd -- something\n:: rest` ) ).toEqual( {
                idl: "\n:: rest",
                name: "cmd",
                summary: " something",
                api: 1
            } );
        } );
        it( "when it is attached to the cmd - ignoring multiple lines (for now)", () => {
            
            expect ( parse3( `IDL=1 cmd -- something\n-- else\n:: rest` ) ).toEqual( {
                idl: "\n-- else\n:: rest",
                name: "cmd",
                summary: " something",
                api: 1
            } );
            
        } );
    } );


} );