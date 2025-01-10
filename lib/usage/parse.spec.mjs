import _parseUsage,
{   
      // NODETYPE_ELIDABLE, 
      NODETYPE_NAMED,
      NODETYPE_LIST,
      NODETYPE_LITERAL,
      ERROR_BAD_OPTION_NAME,
      ERROR_INVALID_TYPE 
} from "./parse.mjs";
import Instr from "../Instr.mjs";
import StartsWith from "../utils/StartsWith.mjs";
import {createPositional,createPositionalWithSuffix} from "./ast.mjs";


/// @brief 
///
/// @note the invocation is very specific so we can pass {requireLeadingLiteral:undefined}
function parseUsage( text, {requireLeadingLiteral} = {requireLeadingLiteral: false } ) {
    if ( requireLeadingLiteral )
        throw new TypeError( "No leading literal" );
    return _parseUsage( new Instr( text ), "" );
}

/// FIXME: many of these tests are in getDictionary.spec.mjs where it probably makes sense;
/// or even a combined test in Idl.spec.mjs
///
/// At the very least, it would be easier of build had been called.
describe( "parseUsage", () => {
    it( "should work for a simple switch", () => {
        expect( parseUsage( "--option" ) ).toEqual( [[{type:NODETYPE_NAMED, shortAlias: undefined,key:'option',option:'--option', value: 'true'}],[],[]]);
    } );
    it( "should work for a switch with a dash", () => {
        expect( parseUsage( "--long-name" ) ).toEqual( [[{type:NODETYPE_NAMED, shortAlias: undefined,key:'longName', option:'--long-name', value: 'true'}],[],[]]);
    } );
    it( "should work for a switch with two dashes", () => {
        expect( parseUsage( "--really-long-name" ) ).toEqual( [[{type:NODETYPE_NAMED, shortAlias: undefined,key:'reallyLongName', option:'--really-long-name', value: 'true'}],[],[]]);
    } );
    it( "should work for a no-switch", () => {
        expect( parseUsage( "--no-option" ) ).toEqual( [[{type:NODETYPE_NAMED, shortAlias: undefined,key:'option', option:'--no-option', value: 'false'}],[],[]]);
    } );
    describe( "should manage a short alias", () => {
        it( "of a mandatory true boolean", () => {
            expect( parseUsage( "(--option|-o)" ) ).toEqual( [[{type:NODETYPE_NAMED, shortAlias: 'o',key:'option',option:'--option', value: 'true'}],[],[]]);
        } );
        it( "of a mandatory false boolean", () => {
            expect( parseUsage( "(--no-option|-O)" ) ).toEqual( [[{type:NODETYPE_NAMED, shortAlias: 'O',key:'option',option:'--no-option', value: 'false'}],[],[]]);
        } );
        it( "of a mandatory valued arg", () => {
            expect( parseUsage( "(-O|--output)=FILE" ) ).toEqual( [[{type:NODETYPE_NAMED, shortAlias: 'O',key:'output',option:'--output', value: 'File'}],[],[]]);
        } );
        it( "of an optional true boolean", () => {
            expect( parseUsage( "[(--option|-o)]" ) ).toEqual( [[],[{type:NODETYPE_NAMED, shortAlias: 'o',key:'option',option:'--option', value: 'true'}],[]]);
        } );
        it( "of an optional false boolean", () => {
            expect( parseUsage( "[(-O|--no-option)]" ) ).toEqual( [[],[{type:NODETYPE_NAMED, shortAlias: 'O',key:'option',option:'--no-option', value: 'false'}],[]]);
        } );
        it( "of an optional valued arg", () => {
            expect( parseUsage( "[(--output|-O)=FILE]" ) ).toEqual( [[],[{type:NODETYPE_NAMED, shortAlias: 'O',key:'output',option:'--output', value: 'File'}],[]]);
        } );
        it( "of a list boolean", () => {
            expect( parseUsage( "[(-v|--verbose)]..." ) ).toEqual( [[],[{type:NODETYPE_LIST,value:{type:NODETYPE_NAMED, shortAlias: 'v',key:'verbose',option:'--verbose', value: 'true'},min:undefined}],[]]);
        } );
        it( "of a list arg", () => {
            expect( parseUsage( "[(--exclude|-x)=GLOB]..." ) ).toEqual( [[],[{type:NODETYPE_LIST,value:{type:NODETYPE_NAMED, shortAlias: 'x',key:'exclude',option:'--exclude', value: 'Glob'},min:undefined}],[]]);
        } );
    } );    
    
    it( "should fail for mixed case option", () => {
        // FIXME: we want to match the position.
        expect( () => parseUsage( "--fooBAR" ) ).toThrowError( Error, StartsWith( ERROR_BAD_OPTION_NAME ) );
    } );
    it( "should fail with double dashes in an option", () => {
        // FIXME: we want to match the position.
        expect( () => parseUsage( "--foo--bar" ) ).toThrowError( Error, StartsWith( ERROR_BAD_OPTION_NAME ) );
    } );
    it( "should fail for mixed case positional", () => {
        expect( () => parseUsage( "FOObar" ) ).toThrowError( Error, StartsWith( ERROR_INVALID_TYPE ) );
    } );
    it( "should work for an optional switch", () => {
        expect( parseUsage( "[--option]" ) ).toEqual( [[],[{type:NODETYPE_NAMED, shortAlias: undefined,key:'option',option:'--option', value: 'true'}],[]]);
    } );
    it( "should fail for two optional switches", () => {
        expect( () => parseUsage( "[--one --two]" ) ).toThrowError( Error, /^expected `]`/ );
    } );
    it( "should work for a string", () => {
        expect( parseUsage( "--option=STRING" ) ).toEqual( [[{type:NODETYPE_NAMED, shortAlias: undefined,key:'option',option:'--option', value: 'String'}],[],[]]);
    } );
    it( "should work for a single literal", () => {
        expect( parseUsage( "--option=text" ) ).toEqual( [[{type:NODETYPE_NAMED, shortAlias: undefined,key:'option',option:'--option', value: ['text']}],[],[]]);
    } );
    it( "should work for a multple literals", () => {
        expect( parseUsage( "--mode=(big|small)" ) ).toEqual( [[{type:NODETYPE_NAMED, shortAlias: undefined,key:'mode',option:'--mode', value: ['big','small']}],[],[]]);
    } );
    it( "should read a positional", () => {
        expect( parseUsage( "STRING" ) ).toEqual( [[],[],[createPositional( 'String', 'STRING' )]]);
    } );
    it( "should read a recurring positional [RE-POS]", () => {
        expect( parseUsage( "STRING..." ) ).toEqual( [[],[],[{type:NODETYPE_LIST, value: createPositional( 'String', 'STRING' ), min: 1}]]);
    } );
    it( "should read a recurring positional with ellision [RE-OUT]", () => {
        expect( parseUsage( "[STRING]..." ) ).toEqual( [[],[],[{type:NODETYPE_LIST, value: createPositional( 'String', 'STRING' ), min: 0}]]);
    } );
    it( "should read a recurring positional embedded in an ellision [RE-IN]", () => {
        expect( parseUsage( "[STRING...]" ) ).toEqual( [[],[],[{type:NODETYPE_LIST, value: createPositional( 'String', 'STRING' ), min: 0}]]);
    } );
    it( "should read recurring optional option [MULT-OUT]", () => {
        expect( parseUsage( "[--something=STR]..." ) ).toEqual( [[],
            [{
                type:NODETYPE_LIST, 
                value: { type: NODETYPE_NAMED, shortAlias: undefined, option:'--something', key:'something', value: 'Str' },
                min: undefined,
            }],
            []
        ]);
    } );
    it( "should object to spread inside [MULT-IN]", () => {
        // Why? What could be wrong with this?
        expect( () => parseUsage( "[--something=STR...]" ) ).toThrow();

    } );
    it( "should object when spread follows ws [DUP-NO-WS]", () => {
        expect( () => parseUsage( "STRING ..." ) ).toThrow();
    } );
    it( "should choke on mixed case literal", () => {
        expect( () => parseUsage( "wOBBLE" ) ).toThrow();
    } );
    it( "should choke on double hyphenated string", () => {
        expect( () => parseUsage( "woble--seam" ) ).toThrow();
    } );
    it( "should create a literal", () => {
        expect( parseUsage( "cmd" ) ).toEqual( [[],[],[{type:"'", value: "cmd"}]] );
    } );
    it( "should create a hypheneated literal", () => {
        expect( parseUsage( "package_name-cmd12" ) ).toEqual( [[],[],[{type:NODETYPE_LITERAL, value: "package_name-cmd12"}]] );
    } );
    it( "should create twos literal", () => {
        expect( parseUsage( "cmd help" ) ).toEqual( [[],[],[{type:NODETYPE_LITERAL, value: "cmd"},{type:NODETYPE_LITERAL, value: "help"}]] );
    } );
    
    describe( "should handled synthesized types", () => {
        it( "where the supertype is a file", () => {
            expect( parseUsage( "ls ICO_FILE" ) ).toEqual( [[],[],[{type:NODETYPE_LITERAL, value: "ls"},createPositional( "IcoFile", "ICO_FILE" )]] );
        } );
        
        it( "where the supertype is a count", () => {
            // 2022_7_22: Check whether these types are properly realised.
            expect( parseUsage( "ls BYTE_COUNT" ) ).toEqual( [[],[],[{type:NODETYPE_LITERAL, value: "ls"},createPositional( "ByteCount", "BYTE_COUNT" )]] );
        } );
    } );
    describe( "should handled suffixed type", () => {
        it( "where the type is a file", () => {
            expect( parseUsage( "cp FILE1 FILE2" ) ).toEqual( [[],[],[{type:NODETYPE_LITERAL, value: "cp"},createPositionalWithSuffix( "File", '1', "FILE1" ),createPositionalWithSuffix( "File", '2', "FILE2" )]] );
        } );
    } );
    
    it( "should reject empty lists", () => {
        expect( () => parseUsage( "()" ) ).toThrowError( Error, StartsWith( "empty `()`" ) );
        
    } );

    describe( "should handle annotations", () => {
        it( "on a single-line mandatory option with no eol", () => {
            const result = parseUsage( "--switch -- This switches!" )
            expect( result ).toEqual( [[
                {type:NODETYPE_NAMED, shortAlias: undefined,key:'switch',option:'--switch', value: 'true', annotation: " This switches!"}
            ],[],[]] );
        } );
        it( "on multi-line mandatory options", () => {
            const result = parseUsage( 
`--switch -- This switches!
--another -- This, too.
          --final 
`             )
            expect( result ).toEqual( [[
                {type:NODETYPE_NAMED, shortAlias: undefined,key:'switch',option:'--switch', value: 'true', annotation: " This switches!"},
                {type:NODETYPE_NAMED, shortAlias: undefined,key:'another',option:'--another', value: 'true', annotation: " This, too."},
                {type:NODETYPE_NAMED, shortAlias: undefined,key:'final',option:'--final', value: 'true'}
            
            ],[],[]] );
        } );
        it( "on multi-line optional options", () => {
            const result = parseUsage( 
`[--switch] -- This switches!
[--final] 
`             )
            expect( result ).toEqual( [[],[
                {type:NODETYPE_NAMED, shortAlias: undefined,key:'switch',option:'--switch', value: 'true', annotation: " This switches!"},
                {type:NODETYPE_NAMED, shortAlias: undefined,key:'final',option:'--final', value: 'true'}
            
            ],[]] );
        } );
        it( "on multi-line repeated optional options with alias", () => {
            const result = parseUsage( 
`[(-s|--switch)]... -- This switches!
[--final] 
`             )
            expect( result ).toEqual( [[],[
                {type:NODETYPE_LIST, value: {type:NODETYPE_NAMED, shortAlias: 's',key:'switch',option:'--switch', value: 'true'}, min: undefined, annotation: " This switches!"},
                {type:NODETYPE_NAMED, shortAlias: undefined,key:'final',option:'--final', value: 'true'}
            
            ],[]] );
        } );    
    } );

    it( "should handle multiple duplicate options [DUP-OPT]", () => {
        // Not our job, guv; it's somebody elese's. (It's handled in build.
        // Nobody tests build. But see [NODUPBOOl])
        expect( parseUsage( "[--option] [--option]" ) ).toEqual( [[],
            [
                {type:NODETYPE_NAMED, shortAlias: undefined,key:'option',option:'--option', value: 'true'},
                {type:NODETYPE_NAMED, shortAlias: undefined,key:'option',option:'--option', value: 'true'}
            ]
        ,[]]);
    } );
} );