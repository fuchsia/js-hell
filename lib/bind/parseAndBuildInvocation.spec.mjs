import Instr from "../Instr.mjs";
import {unwrapSingleImport} from "./_parse.mjs";
import buildInvocation,{ERROR_FAILED_TYPE_ASSERTION} from "./buildInvocation.mjs";
import Binding from "./Binding.mjs";
import StartsWith from "../utils/StartsWith.mjs";
import {privateScope} from "../symbols.mjs";
import Sequence from "../utils/Sequence.mjs";
import {inspect} from "node:util";
import {valueForEquals,_typeof_} from "../consts.mjs";

/// @brief We should probably do this as an AST but...
function 
parseInvocation( instr, parameters = new Map, imports, throwError = false )
    {
        if ( typeof instr === 'string' )
            instr = new Instr( instr );
        if ( !( parameters instanceof Map ) )
            parameters = new Map( Object.entries( parameters ) );
        const invocation = Binding.from( instr );
        // console.log( "invocation", inspect( invocation, { depth: 100 }  ) );
        // const throwError = false;
        if ( typeof imports === 'undefined' ) {
            // assume old !isExpr style.
            const {name} = unwrapSingleImport( invocation.astNode );
            imports = { [name]: ( ...args ) => args };
            const {args} = buildInvocation( invocation, parameters, undefined, throwError, imports );
            return {name,args}; 
        } else {
            if ( typeof imports === 'function' ) {
                imports = { default: imports };
            }
            const {name, args, returnValueReceiver} = buildInvocation( invocation, parameters, undefined, throwError, imports );
            if ( typeof returnValueReceiver !== 'undefined' )
                throw new Error( "rvr" );
            return { name, args};
        }
    }
/// @brief We should probably do this as an AST but...
function 
parseInvocationArgs( instr, parameters = new Map )
    {
        return parseInvocation( instr, parameters ).args;
    }

function 
parseInvocationExpr( instr, parameters = {}, imports, throwError )
    {
        return parseInvocation( instr, parameters, imports, throwError ).args;
    }


const customMatchers = {
    toBeNanO() {
        return {
            compare( actual, expected ) 
                {
                    // 2022_10_5: Should we just do instanceof NanO and then getMessage()?
                    const toErr = actual?.toError;
                    if ( typeof toErr !== 'function' ) {
                        return {
                            pass: false,
                            message: `Object lacks \`toError()\` method`
                        }
                    }
                    const err = toErr.call( actual )
                    if ( !( err instanceof Error ) ) {
                        return {
                            pass: false,
                            message: "Result of `toError()` is not an `Error` instance."
                        }
                    }
                    if ( err.message.match( expected ) ) {
                        return {
                            pass: true,
                            messsage: ""
                        }
                    } else {
                        return {
                            pass: false,
                            message: `message was ${JSON.stringify( err.message )}`
                        }
                    }
                }
        }
    }
};
function
throwError( nano )
    {
        return () => { throw nano.toError() } 
    }

describe( "buildInvocation(parseInvocation(...))", () => {
    
    
    beforeEach(function() {
        jasmine.addMatchers(customMatchers);
    });
    
    it( "should throw on NanO", () => {
        expect( () => {
            const invocation = _parseInvocation( new Instr( "( x )" ), {} );
            buildInvocation( invocation, parameters, false );
        } ).toThrow();
    } );
    it( "should make a single arg call", () => {
        expect( parseInvocation( new Instr( "callback( arg1 )" ), new Map( Object.entries( { 'arg1': 'arg1' } ) ) ) ).toEqual( {
            name: 'callback',
            args: [ 'arg1' ]

        } );
    } );
    it( "should make a nullary call", () => {
        expect( parseInvocation( new Instr( "callback()" ), new Map( Object.entries( { 'arg1': 'arg1' } ) ) ) ).toEqual( {
            name: 'callback',
            args: []

        } );
    } );
    it( "should make a binary call", () => {
        expect( parseInvocation( new Instr( "callback(apple,banana)" ), new Map( Object.entries( { apple: 'apple', banana: 'banana' } ) ) ) ).toEqual( {
            name: 'callback',
            args: ['apple','banana']

        } );
    } );
    describe( "should parse a string", () => {
        it( "that's single quoted", () => { 
            expect( parseInvocation( new Instr( "callback('hello'  )" ) ) ).toEqual( {
                name: 'callback',
                args: ['hello'],

            } );
        } );
        it( "that's double quoted", () => { 
            expect( parseInvocation( new Instr( 'callback(  "hello  world"  )' ) ) ).toEqual( {
                name: 'callback',
                args: ['hello  world']

            } );
        } );
        it( "with escapes", () => { 
            expect( parseInvocation( new Instr( 'callback(  "hello\\"world\\\\"  )' ) ) ).toEqual( {
                name: 'callback',
                args: ['hello"world\\']

            } );
        } );
        it( "with well known escapes", () => { 
            expect( parseInvocation( new Instr( 'callback(  "hello\\r\\nworld"  )' ) ) ).toEqual( {
                name: 'callback',
                args: ['hello\r\nworld']

            } );
        } );
        it( "with unicode escapes", () => { 
            expect( parseInvocation( new Instr( 'callback(  "hello\\u007Bworld"  )' ) ) ).toEqual( {
                name: 'callback',
                args: ['hello{world']

            } );
        } );
    } );
    describe( "should default", () => { 
        it( "a true value", () => {
            expect( parseInvocation( new Instr( "callback(on = true)" ), new Map ) ).toEqual( {
                name: 'callback',
                args: [true]

            } );
        } );
        it( "a false value", () => {
            expect( parseInvocation( new Instr( "callback(on = false)" ), new Map ) ).toEqual( {
                name: 'callback',
                args: [false]

            } );
        } );
        it( "a null value", () => {
            expect( parseInvocation( new Instr( "callback(on = null)" ), new Map ) ).toEqual( {
                name: 'callback',
                args: [null]

            } );
        } );
        it( "an unsigned int value", () => {
            expect( parseInvocation( new Instr( "callback(on = 434)" ), new Map ) ).toEqual( {
                name: 'callback',
                args: [434]

            } );
        } );
        it( "a negative int value", () => {
                expect( parseInvocation( new Instr( "callback(on = -434)" ), new Map ) ).toEqual( {
                    name: 'callback',
                    args: [-434]

                } );
            } );
        it( "a string value", () => {
            expect( parseInvocation( new Instr( 'callback(on = "hello world")' ), new Map ) ).toEqual( {
                name: 'callback',
                args: ['hello world']

            } );
        } );
        it( "the undefined value", () => {
            expect( parseInvocation( new Instr( 'callback(on = undefined)' ), new Map ) ).toEqual( {
                name: 'callback',
                args: [undefined]

            } );
        } );
    } );
     
    it( "should alternate", () => {
        expect( parseInvocation( new Instr( "callback(first ?? second)" ), new Map( Object.entries( { 'second': 222 } ) ) ) ).toEqual( {
            name: 'callback',
            args: [222]

        } );
    } );
    it( "shouldn't use the alternate if not needed", () => {
        expect( parseInvocation( new Instr( "callback(first ?? second)" ), new Map( Object.entries( { 'first': 111 } ) ) ) ).toEqual( {
            name: 'callback',
            args: [111]

        } );
    } );
    it( "should be able to use an alternate that's a value", () => {
        expect( parseInvocation( new Instr( "callback(first ?? second ?? 432)" ), new Map ) ).toEqual( {
            name: 'callback',
            args: [432]

        } );
    } );
    
    
    it( "should make a double nested property access", () => {
        expect( parseInvocation( "callback( arg1.child.value )", { 'arg1': { child: { value: 'deep' } } } ) ).toEqual( {
            name: 'callback',
            args: [ 'deep' ]

        } );
    } );
    it( "should be able to access the property of a method", () => {
        expect( parseInvocation( "callback( arg1.method().value )", { 'arg1': { method: () => ({ value: 'retv' }) } } ) ).toEqual( {
            name: 'callback',
            args: [ 'retv' ]

        } );
    } );
    it( "should be able to nest a parenthesised await [AWAIT]", async () => {
        const res = parseInvocation( "callback( (await arg1.method()).value )", { 'arg1': { method: async () => ({ value: 'retv' }) } } );
        expect( res.args ).toBeInstanceOf( Promise );
        res.args = await res.args;
        expect( res ).toEqual( {
            name: 'callback',
            args: [ 'retv' ]

        } );
    } );
    it( "should be able to nest a parenthesised await and await on the result [AWAIT-AWAIT]", async () => {
        const f = {
             file: async () => ({ 
                    text: async () => 'retv' 
                })
        };
        const res = parseInvocation( "callback( await (await f.file()).text() )", { f } ) ;
        expect( res.args ).toBeInstanceOf( Promise );
        res.args = await res.args;
        
        expect( res ).toEqual( {
            name: 'callback',
            args: [ 'retv' ]

        } );
    } );
    
    it( "slices shouldn't be defaultable", () => {
        // 2022_7_20: This is perfectly reasonable, but we don't support it - as yet.
        // Remove this test once we do.
        
        expect( () => parseInvocation( new Instr( "callback(first[4] = 5)" ), new Map ) ).toThrow();
    } );
    
    describe( "should access properties", () => {
        it( "that exist", () => {
            expect( parseInvocation( new Instr( "callback($string.length)" ), new Map( [[ '$string', "hello" ]] ) ) )
            .toEqual({
                name: 'callback'
                ,args: ['hello'.length]

            } ); 
        } );
        it( "and throw when they are missing", () => {
            expect( parseInvocationArgs( "callback($string.wibble)", { '$string': "hello" } ) )
            .toBeNanO( StartsWith( "No property" ) )  
        } );
        it( "but default them when missing", () => {
            expect( parseInvocation( "callback($string.charCount = 0)" ), { '$string': "hello" } ) 
            .toEqual({
                name: 'callback'
                ,args: [0]

            } ); 
        } );
        it( "and coalesce when missing", () => {
            // This one is the most reasonable of the lot.
            expect( parseInvocation( "callback($string.charCount ?? 0)" ), { '$string': "hello" } ) 
            .toEqual({
                name: 'callback'
                ,args: [0]

            } ); 
        } );
        it( "and make unary method calls", () => {
            expect( parseInvocation( "callback(date.getUTCMonth())", { 'date': new Date( 0 ) } ) ).toEqual({
                name: 'callback'
                ,args: [0]

            } ); 
        } );        
    } );
    describe( "should index array entries", () => {
        it( "that exist", () => {
            expect( parseInvocation( "callback($array[1])", { '$array': [ 'a', 'b', 'c' ] } ) )
            .toEqual({
                name: 'callback'
                ,args: ['b']

            } ); 
        } );
        it( "and throw when they are missing", () => {
            expect( parseInvocationArgs( "callback($array[500])", { '$array': [ 'a', 'b', 'c' ] } ) )
            .toBeNanO( StartsWith( "Index out of range" ) ) 
        } );
        
        it( "and not allow defaulting", () => {
            // 2022_9_28:  Defaulting is only permittedo an SimpelIndex. Make sense?
            expect( () => parseInvocation( "callback($array[500] = 'z')", { '$array': [ 'a', 'b', 'c' ] } ) ) 
            .toThrow()
        } );
        it( "and coalesce when missing", () => {
            // This one is the most reasonable of the lot.
            expect( parseInvocation( "callback($array[500] ?? 'omega')", { '$array': [ 'a', 'b', 'c' ] } ) ) 
            .toEqual({
                name: 'callback'
                ,args: ['omega']

            } ); 
        } );
    } );
    
    describe( "should be able to handle literal values", () => {
        it( "in the argument list", () => { 
            expect( parseInvocation( new Instr( 'callback(4,true,false,"hello",null,undefined)' ), new Map ) ).toEqual( {
                name: 'callback',
                args: [4,true,false,"hello",null,undefined]

            } );
        } );
    } );
    describe( "should read an array", () => {
        it( "that's empty", () => {
            expect( parseInvocation( new Instr( "callback([])" ), new Map( Object.entries( { } ) ) ) ).toEqual( {
                name: 'callback',
                args: [[]]

            } );
        } );
        it( "that has a single element", () => {
            expect( parseInvocation( new Instr( "callback([zero])" ), new Map( Object.entries( { zero: 0, one: 1, two: 2 } ) ) ) ).toEqual( {
                name: 'callback',
                args: [[0]]

            } );
        } );
        it( "that has multiple elements", () => {
            const res = parseInvocation( new Instr( "callback( [ two, zero, one ] )  " ), new Map( Object.entries( { zero: 0, one: 1, two: 2 } ) ) )
            expect( res ).toEqual( {
                name: 'callback',
                args: [[2,0,1]]

            } );
        } );
    } );
    describe( "should read an object", () => {
        it( "that's empty", () => {
            expect( parseInvocation( new Instr( "callback({})" ), new Map( Object.entries( { } ) ) ) ).toEqual( {
                name: 'callback',
                args: [{}]

            } );
        } );
        it( "that has a single element", () => {
            expect( parseInvocation( new Instr( "callback({value:one})" ), new Map( Object.entries( { zero: 0, one: 1, two: 2 } ) ) ) ).toEqual( {
                name: 'callback',
                args: [{value:1}]

            } );
        } );
        it( "that has a single shortcut element", () => {
            expect( parseInvocation( new Instr( "callback({two})" ), new Map( Object.entries( { zero: 0, one: 1, two: 2 } ) ) ) ).toEqual( {
                name: 'callback',
                args: [{two:2}]

            } );
        } );
        it( "that has multiple elements (with shorthands and defaulting)", () => {
            const result = parseInvocation( new Instr( "callback( { zero, x: one = 1, four = 4 } )  " ), new Map( Object.entries( { zero: 0, one: 1, two: 2 } ) ) );
            expect( result ).toEqual( {
                name: 'callback',
                args: [{zero:0,x:1,four:4}]

            } );
        } );
    } );
    describe( "should handle array subscripts", () => {
        it( "and not require them on arrays anymore", () => {
            expect( parseInvocation( new Instr( "callback(x)" ), new Map( Object.entries( { x: [] } ) ) ) ).toEqual( {
                name: 'callback',
                args: [[]]

            } );
        } );
        it( "and throw, when out of range", () => {
            expect( parseInvocationArgs( "callback(x[0])", { x: [] } ) ).toBeNanO( StartsWith( "Index out of range" ) );
        } );
        it( "and throw, when used on non arrays", () => {
            const res = parseInvocationArgs( "callback(fred[0])", { fred: {} } );
            expect( res ).toBeNanO(StartsWith( "No property" ) );
        } );
        /*it( "and throw when omitted on a cast of an indefinite array", () => {
            expect( () => parseInvocation( new Instr( "callback(x[] to String)" ), new Map( Object.entries( { x: [] } ) ) ) ).toThrow();
        } );*/
        it( "that index one element", () => {
            expect(  parseInvocation( new Instr( "callback(x[0])" ), new Map( Object.entries( { x: ['hello'] } ) ) ) ).toEqual( {
                name: 'callback',
                args: ['hello']

            } );
        } );
        if ( !"This no longer applies as we don't synthesize $0 and $1 but alias then - retained in case we change our mind" ) {
            it( "when disguised as positionals", () => {
                expect(  parseInvocation( new Instr( "say($1,$0)" ), new Map( Object.entries( { $: ['world','hello'] } ) ) ) ).toEqual( {
                    name: 'say',
                    args: ['hello','world']

                } );
            } );
        }
        describe( "that slice", () => {
            // FIXME: there should be some throws.
            it( "via the binary slice function", () => {
                expect(  parseInvocation( new Instr( "callback(x.slice(1,2))" ), new Map( Object.entries( { x: ['zero','one','two','three','four'] } ) ) ) ).toEqual( {
                    name: 'callback',
                    args: [ ['one'] ]

                } );
            } );
            it( "via the binary slice function with a trailing comma", () => {
                expect(  parseInvocation( new Instr( "callback(x.slice(1,2,))" ), new Map( Object.entries( { x: ['zero','one','two','three','four'] } ) ) ) ).toEqual( {
                    name: 'callback',
                    args: [ ['one'] ]

                } );
            } );
            it( "via the unary slice function", () => {
                expect(  parseInvocation( new Instr( "callback(x.slice(4))" ), new Map( Object.entries( { x: ['zero','one','two','three','four'] } ) ) ) ).toEqual( {
                    name: 'callback',
                    args: [ ['four'] ]

                } );
            } );
            it( "via the unary slice function with a trailing comma", () => {
                expect(  parseInvocation( new Instr( "callback(x.slice(3,))" ), new Map( Object.entries( { x: ['zero','one','two','three','four'] } ) ) ) ).toEqual( {
                    name: 'callback',
                    args: [ ['three','four'] ]

                } );
            } );
        } );
    } );
    it( "should callback with property selection", () => {
        expect(  parseInvocation( 
            "callback(file.map( t => ({filename:t.name})))", 
            {
                file: [
                    { name: 'f.txt', }, 
                    { name: 'g.txt', } 
                ]
            }
        ) ).toEqual( {
            name: 'callback',
            args: [[{filename:'f.txt'},{filename:'g.txt'}]]

        } );
    } );
    describe( "NanO should", () => {
        it( "pass through slice as an error", () => 
            expect( parseInvocationArgs( "callback(text.length)", {} ) ).toBeNanO( StartsWith( 'Missing parameter "text"' ) ) 
        );
        it( "pass through cast as an error", () => 
            expect( parseInvocationArgs( "callback(text.toString())", {} ) ).toBeNanO( StartsWith( 'Missing parameter "text"' ) ) 
        );
        it( "pass through cast and be caught via '??'", () => 
            expect(  parseInvocation( "callback(text.toString() ?? 'failed')", {} ) ) 
            .toEqual( {
                name: 'callback',
                args: ['failed']

            } )
        );
        it( "pass through a property access and be caught via '??'", () => 
            expect(  parseInvocation( "callback(text.length ?? 'failed')", {} ) ) 
            .toEqual( {
                name: 'callback',
                args: ['failed']

            } )
        );
        it( "pass through an index  and be caught via '??'", () => 
            expect(  parseInvocation( "callback(array[4] ?? 'failed')", {} ) ) 
            .toEqual( {
                name: 'callback',
                args: ['failed']

            } )
        );
    } );

    it( "should convert a sequence to an array unproblematically on double use", () => {
        const iterator = function*() {
            yield "hello";
            yield "world";
        }()
        const {args} = parseInvocation( 
            new Instr( "callback(d,d)" ), 
            {
                d: new Sequence( iterator )
            } 
        );
        // 2022_10_19: Should this be true? Or should they be copies?
        expect( args[0] === args[1] ).toBeTruthy();
        expect( args[0] ).toEqual( [ "hello", "world"] );
    } );
    it( "shouldn't allow a function to be realised", () => 
        expect( () => parseInvocationArgs( "callback(thing.method)", { thing: { method: () => {} } } ) )
        .toThrowError( Error, StartsWith( "cannot realise a function" ) ) 
    );
    describe( "the ternary op", () => {
        it ( "should evaluate a true expression", () => 
            expect( parseInvocationArgs( "callback( cond ? left : right )", { cond: true, left: 'left', right: 'right' } ) )
            .toEqual( ['left'] )
        ); 
        it ( "should evaluate a false expression", () => 
            expect( parseInvocationArgs( "callback( cond ? left : right )", { cond: false, left: 'left', right: 'right' } ) )
            .toEqual( ['right'] )
        );     
        it ( "should throw if the ternary condition is not a booelan", () => 
            expect( () => parseInvocationArgs( "callback( cond ? left : right )", { cond: 0, left: 'left', right: 'right' } ) )
            .toThrowError( TypeError, "Condition to `?:` must be a boolean." )  
            // ( ['right'] )
        );         
    } );

    it( "should do a rest array", () => {
        expect(  parseInvocation( "callback(...array)", {array: [ 'a', 'b', 'c' ] } ) ) 
        .toEqual( {
            name: 'callback',
            args: ['a','b','c']

        } )
    } );
    
    it( "should be capable of calling a function", () => {
        expect(  parseInvocation( "callback(fetch($1))", {$1: "url", fetch: u => u === "url" ? "result" : "fail" } ) ) 
        .toEqual( {
            name: 'callback',
            args: ['result']

        } )
    } );
    describe( "new should", () => {
        class Wibble {};
        it( "work at the top level", () => {
            const result = parseInvocationArgs( "callback(new Wibble())", {Wibble } )[0];
            expect( result ).toBeInstanceOf( Wibble ); 
        } );
        it( "work on a method (i.e. subclass)", () => {
            const result = parseInvocationArgs( "callback(new namespace.Wibble())", { namespace: { Wibble } } )[0];
            expect( result ).toBeInstanceOf( Wibble ); 
        } );
        it( "not be callable without brackets", () => {
            expect ( () => parseInvocationArgs( "callback(new Wibble)" ) )
            .toThrowError( Error, StartsWith( "`new`" ) );
        } );
        it( "not be callable without brackets", () => {
            expect ( () => parseInvocationArgs( "callback(new namespace.Wibble)" ) )
            .toThrowError( Error, StartsWith( "`new`" ) );
        } );
    } );

    describe( "private properties", () => {
        it( "should not be indexable", () => {
            const args = {
                x: {
                    [privateScope]: new Set( ['y'] ),
                    y: "hello",
                }
            }; 
            expect(  parseInvocationArgs( "callback(x.y)", args ) ) 
            .toBeNanO( StartsWith( "No property" ) )
        } );
        it( "should not be invokable", () => {
            class X {
                get[privateScope]() { return new Set( ['y'] ) };
                y() { return "hello" }
            };
            const result = parseInvocationArgs( "callback(x.y())", { x: new X } ) ;
            expect( result ) 
            .toBeNanO( StartsWith( "No method" ) )
        } );
        
    } );

    describe( "should NOT unwrap a promise", () => {
        it( "in an argument list [WRAPPED-ARG]", async () => {
            const p = Promise.resolve( "yes!" );
            const result = await parseInvocationArgs( "callback( x.y())", { x: { y() { return p }  } } ) ;
            expect( result )
            .toEqual( [ p ] );
        } ); 
        it( "in an object literal [WRAPPED-IN-OBJECT]", async () => {
            const p = Promise.resolve( "yes!" );
            const result = await parseInvocationArgs( "callback({y: x.y()})", { x: { y() { return p }  } } ) ;
            expect( result )
            .toEqual( [ { y: p } ] );
        } );
    } );
    describe( "should unwrap a promise", () => {
        it( "in an argument list", async () => {
            const p = Promise.resolve( "yes!" );
            const result = await parseInvocationArgs( "callback( await x.y())", { x: { y() { return p }  } } ) ;
            expect( result )
            .toEqual( [ "yes!" ] );
        } ); 
        it( "in an object literal", async () => {
            const p = Promise.resolve( "yes!" );
            const result = await parseInvocationArgs( "callback({y: await x.y()})", { x: { y() { return p }  } } ) ;
            expect( result )
            .toEqual( [ { y: "yes!" } ] );
        } );
        it( "that we index", async () => {
            const p = Promise.resolve( { answer: "positive" } );
            const result = await parseInvocationArgs( "callback((await x.y()).answer)", { x: { y() { return p }  } } ) ;
            expect( result )
            .toEqual( [ "positive" ] );
        } );
    } );       
    describe( "function callback", () => {
        describe( "to map should map", () => {
            it( "to an object with propery selection", () => {
                expect(  parseInvocationArgs( 
                    "default( file.map( f => ({filename:f.name}) ) )", 
                    {
                        file: [
                            { name: 'f.txt', }, 
                            { name: 'g.txt', } 
                        ]
                    }
                ) ).toEqual( 
                    
                    [[{filename:'f.txt'},{filename:'g.txt'}]]
                    
                );
            } );
            it( "to an object with propery selection, nested casting and global property reference", () => {
                const result = parseInvocationArgs( 
                    "callback(file.map(f=>({filename:f.name,data: f.toData(),prop}) ))", 
                    {
                        prop: true,
                        file: [
                            { name: 'f.txt', toData() { return "12345" } }, 
                            { name: 'g.txt', toData() { return "67890" } } 
                        ]
                    }
                );
                expect( result ).toEqual( 
                    [[{filename:'f.txt',data:"12345",prop:true},{filename:'g.txt',data:"67890",prop:true}]]
                );
            } );
        } );
        it( "to sort should sort", () => {
        
            expect(  parseInvocationArgs( 
                "default( files.sort( (a,b) => a.name.localeCompare(b.name) ) )", 
                {
                    files: [
                        { name: 'alfred.txt', }, 
                        { name: 'beth.txt', }, 
                        { name: 'anna.txt', }, 
                        { name: 'albert.txt', } 
                    ]
                }
            ) ).toEqual( 
                
                [[{name:'albert.txt'},{name:'alfred.txt'},{name:'anna.txt'},{name:'beth.txt'}]]
                
            );
        } );
    } )
    describe( "when type checking", () => {
        const String = {
            isString( s ) { return typeof s === 'string' }
        };
        const Custom = {
            isCustom( s ) { return typeof s === 'string' }
        };
        
        it( "should pass a scalar type", () => {
            expect( parseInvocationExpr( "default() as JSON", {
                JSON: { isJSON() { return true } }
            }, {
                default: () => ({})
            } 
            ) ).toEqual( {} );
        } );
        it( "should fail an invalid scalar", () => {
            expect( () => parseInvocationExpr( "default() as String", {
                String 
            }, {
                default: () => 4
            } 
            ) ).toThrowError( Error, StartsWith( ERROR_FAILED_TYPE_ASSERTION ) )
        } );
        it( "should pass an array", () => {
            expect( parseInvocationExpr( "default() as Custom[]", {
                Custom
            }, {
                default: () => ["hello", "world"]
            } 
            ) ).toEqual( ["hello","world"] );
        } );
        it( "should fail an invalid array", () => {
            expect( () => parseInvocationExpr( "default() as String[]", {String}, {
                default: () => ["hello", 4, "world"]
            } 
            ) ).toThrowError( Error, StartsWith( ERROR_FAILED_TYPE_ASSERTION ) );
        } );
        it( "should pass an iterator", () => {
            expect( parseInvocationExpr( "default() as *String", {String}, {
                default: function*() { yield "hello"; yield "world" }
            } 
            ).toArray() ).toEqual( ["hello","world"] );
        } );
        it( "should fail an invalid iterator", () => {
            expect( () => parseInvocationExpr( "default() as *String", {String}, {
                default: function*() { yield "hello"; yield 4; yield "world" }
            }).toArray() ).toThrowError( Error, StartsWith( ERROR_FAILED_TYPE_ASSERTION ) );
        } );
        it( "should pass an async iterator", async () => {
            expect( await Array.fromAsync( parseInvocationExpr( "default() as async*String", {String}, {
                default: async function*() { yield "hello"; yield "world" }
            } 
            ) ) ).toEqual( ["hello","world"] );
        } );
        it( "should fail an invalid async iterator", async () => {
            await expectAsync( Array.fromAsync( parseInvocationExpr( "default() as async*String", {String}, {
                default: async function*() { yield "hello"; yield 4; yield "world" }
            } 
            ) ) ).toBeRejectedWithError( Error, StartsWith( ERROR_FAILED_TYPE_ASSERTION ) );
        } );
        it( "should work using instanceof", () => {
            expect( parseInvocationExpr( "default() as Number", {
                Number 
            }, {
                default: () => new Number( 4 )
            } 
            ) ).toEqual( new Number( 4 ) );

        } );
        it( "should fail using instanceof", () => {
            expect( () => parseInvocationExpr( "default() as Boolean", {Boolean}, () => new Number( 4 ) ) )
            .toThrowError( Error, StartsWith( ERROR_FAILED_TYPE_ASSERTION ) );
        
        } );
        it( "should work using typeof", () => {
            expect( parseInvocationExpr( "default() as number", {}, () => 4 ) )
            .toEqual( 4 );
        
        } );
        it( "should fail using typeof", () => {
            expect( () => parseInvocationExpr( "default() as number", {}, () => "" ) )
            .toThrowError( Error, StartsWith( ERROR_FAILED_TYPE_ASSERTION ) );
        } );
    } );
    it( "should handle imports via 'with' and a separate import object", () => {
        const {args} = parseInvocation( "with(one,f) f( one, g )", { g: 'g' }, { f: ( x, g ) => g + x, one: 'one' } );
        expect( args ).toEqual( 'gone' );
    } );
    describe( "instanceof", () => {
        it( "to match an instance", () => {
            expect( parseInvocationExpr( "with() s instanceof String", { String, s: new String( "s" ) }, 
                { default: () => {} } 
            ) ).toEqual( true );
        } );
        it( "to match a nested type", () => {
            class Thang {};
            expect( parseInvocationExpr( "with() t instanceof Thing.Thang", { Thing: {Thang}, t: new Thang }, 
                { default: () => {} } 
            ) ).toEqual( true );
        } );
        it( "to fail to match a non-instance", () => {
            expect( parseInvocationExpr( "with() s instanceof Number", { Number, s: new String( "s" ) }, 
                { default: () => {} } 
            ) ).toEqual( false );
        } );
    } );
    describe( "should handle typeof", () => {
        it ( "a bigint", () => {
            expect (  parseInvocationExpr( "with() typeof value", { value: 1n }, {} ) )
            .toEqual( 'bigint' );
        } );
        it ( "typeof", () => {
            expect ( parseInvocationExpr( "with() typeof typeof value", { value: 1n }, {} ) )
            .toEqual( 'string' );
        } );
        it ( "null", () => {
            expect ( parseInvocationExpr( "with() typeof value", { value: null }, {} ) )
            .toEqual( 'null' );
        } );
        it ( "a defined undefined value", () => {
            expect( parseInvocationExpr( "with() typeof value", { value: undefined }, {} ) )
            .toEqual( 'undefined' );
        } );
        it ( "a missing property", () => {
            expect( parseInvocationExpr( "with() typeof value.property", {value:{}}, {} ) )
            .toEqual( 'undefined' );
        } );
        it ( "a missing value", () => {
            expect( () => parseInvocationExpr( "with() typeof value.method()", {value:{}}, {}, true ) )
            .toThrowError( TypeError, StartsWith( "No method " ) );
        } );
        it ( "a missing property of a property", () => {
            expect( () => parseInvocationExpr( "with() typeof value.child.property", {value:{}}, {}, true ) )
            .toThrowError( TypeError, StartsWith( "No property " ) );
        } );
        it ( "a missing value", () => {
            expect( parseInvocationExpr( "with() typeof value", {}, {} ) )
            .toEqual( "undefined" );
        } );
        it( "a hooked value", () => {
            expect( parseInvocationExpr( "with() typeof value", {value: {[_typeof_]:'integer'}}, {} ) )
            .toEqual( "integer" );
        } );
    } );
    describe( "should handle === and !==", () => {
        it ( "with 4 === 4 as true", () => {
            expect (  parseInvocationExpr( "with() lhs === rhs", { lhs: 4, rhs: 4 }, {} ) )
            .toBeTrue();
        } );
        it ( "with 'foo' === 'bar' as false", () => {
            expect (  parseInvocationExpr( "with() lhs === rhs", { lhs: 'foo', rhs: 'bar' }, {} ) )
            .toBeFalse();
        } );
        it ( "with x !== x as false", () => {
            const x = {};
            expect (  parseInvocationExpr( "with() lhs !== rhs", { lhs: x, rhs: x }, {} ) )
            .toBeFalse();
        } );
        it ( "with Symbol(1') !== Symbol('2') as true", () => {
            expect (  parseInvocationExpr( "with() lhs !== rhs", { lhs: Symbol( 's1' ), rhs: Symbol( 's2' ) }, {} ) )
            .toBeTrue();
        } );
    } );
    describe( "should handle !", () => {
        it ( "inverting a true value", () => {
            expect (  parseInvocationExpr( "with() !thing", { thing: true }, {} ) )
            .toBeFalse();
        } );
        it ( "inverting a false method", () => {
            expect (  parseInvocationExpr( "with() !thing()", { thing: () => false }, {} ) )
            .toBeTrue();
        } );
        it ( "objecting a non-boolean", () => {
            expect ( () => parseInvocationExpr( "with() !thing", { thing: "" }, {} ) )
            .toThrowError( TypeError, "Condition to `!` must be a boolean." )  
        } );
    } );
    
    it ( "should handle a type in the with() clause [ASSERT-IMPORTED-TYPE]", () => {
        class Type {
        };
        expect(  parseInvocationExpr( "with(Type,default) default() as Type", {}, {default:() => new Type, Type } ) )
        .toBeInstanceOf( Type );
    } );

    it( `should handle a template`, () => {
        expect( parseInvocationExpr( 'with () `hello${` `}world`', {}, {} ) ).toEqual(
            "hello world" 
        );
    } );
} );