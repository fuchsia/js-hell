import Instr from "../Instr.mjs";
import {TYPE_ARRAY, TYPE_OBJECT, TYPE_UNARY, UNARY_REST, UNARY_SYNC, BINARY_PIPE, createAwait, createUnary, createBinary, createDynamicCast, createLiteral, createLookup, createSubscript,createCall,createMethod,createCallback,createObjectLiteral, createCapture, createArrayLiteral,
SCOPE_GLOBAL, SCOPE_IMPORT, SCOPE_LOCAL, } from "./ast.mjs";
import Binding from "./Binding.mjs";
import StartsWith from "../utils/StartsWith.mjs";
import {ERROR_MISMATCH,unwrapSingleImport,wrapSingleImport} from "./_parse.mjs";
import ExprType from "./ExprType.mjs";

import {AS_ITERATOR, AS_ARRAY, AS_SCALAR} from "./consts.mjs";


// 2024_6_17: Historic format.
// 2024_8_1: isExpr, another historic format. Use wrapSingleImport to convert,
// and make name an array.
 function 
parseInvocation( instr, wantNewFormat = false ) {
    const binding = Binding.from( instr );
    if ( wantNewFormat ) {
        const {imports,astNode,cast,void:_void,globals} = binding;
        // Historic names: replace.
        return {name:imports,args:astNode,cast,void:_void,globals};
    } else {
        const {imports,astNode,cast,void:_void,globals} = binding;
        if ( imports.length !== 1 )
            throw new Error( "There should only be one import" );
        return {name:imports[0],args:unwrapSingleImport( astNode ).args,cast,void:_void,globals}; 
    }

}
function 
unwrapAwait( node ) {
    if ( node.type !== TYPE_UNARY || node.op !== UNARY_SYNC )
        throw new Error( "Expected an await node" );
    return node.object;
}

function 
parseBindingTextToAst( text, expectAwait  = false ) {
    const {astNode} = Binding.from( new Instr( text ) )
    // 2024_11_19: This isn't in the source and is implicitly inserted? I'm not sure it should be here. 
    // But it is. However it's not the bug I'm fixing today.
    if ( expectAwait ) {
        return unwrapAwait( astNode );
    }
    return astNode;
}

describe( "binding/parse", () => {
    describe( "should", () => {
        it( "parse a nullary default call", () => {
            expect( parseInvocation( new Instr( "default()" ) ) ).toEqual( {
                name: 'default',
                args: [ ]
                ,cast:undefined
                ,void: false
                ,globals: new Set
            } );
        } );
        it( "parse a nullary call that casts its result as a scalar", () => {
            expect( parseInvocation( new Instr( "default() as String" ) ) ).toEqual( {
                name: 'default',
                args: [ ]
                ,cast:new ExprType('String',AS_SCALAR )
                ,void: false
                // 2024_8_16:  Type checking inserts `String` for String.isString
                ,globals: new Set( ['String'] )
            } );
        } );
        it( "parse a nullary call that casts its result as an array", () => {
            expect( parseInvocation( new Instr( "default() as String[]" ) ) ).toEqual( {
                name: 'default',
                args: [ ]
                ,cast:new ExprType('String',AS_ARRAY )
                ,void: false
                ,globals: new Set( [ 'String' ] )
            } );
            // let projectDir = get-projectdir app.json
            // cd projectDir 
            // appManifest = get-json app.json 
            // moduleScripts = (appManifest.scripts | glob *.mjs )
            // classicScripts = (appManifest.scripts | glob *.js )
            // count ...( appManifest.script | glob --not *.mjs *.js ) && die "Unexpected scripts"
            // 
                      
        } );
        it( "parse a nullary call that casts its result as an iterator", () => {
            expect( parseInvocation( new Instr( "default() as *String" ) ) ).toEqual( {
                name: 'default',
                args: [ ]
                ,cast:new ExprType('String',AS_ITERATOR )
                ,void: false
                ,globals: new Set( [ 'String' ] )
            } );
        } );
        it( "parse an iterator call", () => {
            expect( parseInvocation( new Instr( "default(*String)" ) ) ).toEqual( {
                name: 'default',
                args: [ 
                    createMethod( Symbol.iterator, createLookup( 'String', { scope: SCOPE_GLOBAL } ) )
                ]
                ,cast: undefined
                ,void: false
                ,globals: new Set( ['String'] )
            } );
            // let projectDir = get-projectdir app.json
            // cd projectDir 
            // appManifest = get-json app.json 
            // moduleScripts = (appManifest.scripts | glob *.mjs )
            // classicScripts = (appManifest.scripts | glob *.js )
            // count ( appManifest.script | glob --not *.mjs *.js ) && die "Unexpected scripts"
            // 
                      
        } );
        it( "parse an object call with an implied property name", () => {
            const res = parseInvocation( new Instr( "default({$1.x})" ) )
            expect( res ).toEqual( {
                name: 'default',
                args: [ createObjectLiteral(  
                    [
                        [ 'x', createSubscript( createLookup( '$1', { scope: SCOPE_GLOBAL } ), 'x' ) ] 
                    ]  ) ] 
                ,cast: undefined
                ,void: false
                ,globals: new Set( [ '$1' ] )
            } );
                      
        } );
        it( "parse an object call with await", () => {
            const res = parseInvocation( new Instr( "default(await $1.text())" ) )
            expect( res ).toEqual( {
                name: 'default',
                args: [
                    createAwait( createMethod( 'text', createLookup( '$1', { scope: SCOPE_GLOBAL } ) ) ) 
                ] 
                ,cast: undefined
                ,void: false
                ,globals: new Set( [ '$1' ] )
            } );
        } );
        it( "fail to parse an item that is an iterator and an indefinite array", () => {
            // for this to be (*String)[] it would mean `[]` binds less tightly than `*String[4]`
            // It's also redudent as `*(String[])` (except it uses a copy).
            //
            // So we should only allow the right most one to be indefinite, and only when
            // it's not an iterator.
            //
            // Ditto, a range, I think. 
            expect( () => parseInvocation( new Instr( "default(*String[])" ) ) ).toThrow();
        } );
        it( "parse an array index", () => {
            const res = parseInvocation( new Instr( "default(fred[0])" ) )
            expect( res ).toEqual( {
                name: 'default',
                args: [  
                    createSubscript( createLookup( 'fred', { scope: SCOPE_GLOBAL } ), 0 )
                ]
                ,cast: undefined
                ,void: false
                ,globals: new Set( [ 'fred' ] )
            } );
        
             
        } );
        it( "parse an async iterator call", () => {
            const res = parseInvocation( new Instr( "default(async*$1)" ) )
            expect( res ).toEqual( {
                name: 'default',
                args: [
                    createMethod( Symbol.asyncIterator, createLookup( '$1', { scope: SCOPE_GLOBAL } )  ) 
                ] 
                ,cast: undefined
                ,void: false
                ,globals: new Set( [ '$1' ] )
            } );
        } );
        it( "parse a global nullary function call", () => {
            const res = parseInvocation( new Instr( "default(fetch())" ) )
            expect( res ).toEqual( {
                name: 'default',
                args: [
                    createCall( 'fetch' )  
                ] 
                ,cast: undefined
                ,void: false
                ,globals: new Set( [ 'fetch' ] )
            } );
        } );
        it( "parse a global unary function call", () => {
            const res = parseInvocation( new Instr( "default(fetch($1))" ) )
            expect( res ).toEqual( {
                name: 'default',
                args: [
                    createCall( 'fetch', [ createLookup( "$1", { scope: SCOPE_GLOBAL } ) ] )  
                ] 
                ,cast: undefined
                ,void: false
                ,globals: new Set( [ '$1', 'fetch' ] )
                
            } );
        } );
        it( "accept basic output capture", () => {
            expect( parseInvocation( new Instr( "default() -> $1" ), true ) ).toEqual( {
                name: [ 'default' ]
                ,args: createCapture( createAwait( createCall( 'default', [], { import: true } ) ), createLookup( "$1", { scope: SCOPE_GLOBAL, write: true } ) )
                ,cast: undefined
                ,void: true
                ,globals: new Set( [ '$1' ] )  
            } );
        } );
        it( "accept output capture with type assertion", () => {
            expect( parseInvocation( new Instr( "default() as JSON -> $1" ), true ) ).toEqual( {
                name: [ 'default' ]
                ,args: createCapture( createAwait( createCall( 'default', [], { import: true } ) ), createLookup( "$1", { scope: SCOPE_GLOBAL, write: true } ), new ExprType( 'JSON', AS_SCALAR  ) )
                ,cast: undefined
                ,void: true
                ,globals: new Set( [ '$1' ] )  
            } );
        } );
        describe( "tokenisation errors should be avoided for identifiers that begin", () => {
            it( "`new`", () => {
                const res = parseInvocation( new Instr( "default(newthing)" ) )
                expect( res ).toEqual( {
                    name: 'default',
                    args: [  
                        createLookup( 'newthing', { scope: SCOPE_GLOBAL } )
                    ]
                    ,cast: undefined
                    ,void: false
                    ,globals: new Set( [ 'newthing' ] )       
                } );
            } );
            it( "`async`", () => {
                const res = parseInvocation( new Instr( "default(async_  )" ) )
                expect( res ).toEqual( {
                    name: 'default',
                    args: [  
                        createLookup( 'async_', { scope: SCOPE_GLOBAL } )
                    ]
                    ,cast: undefined
                    ,void: false
                    ,globals: new Set( [ 'async_' ] )
                } );
            } );
            it( "`await`", () => {
                const res = parseInvocation( new Instr( "default(awaitable)" ) )
                expect( res ).toEqual( {
                    name: 'default',
                    args: [  
                        createLookup( 'awaitable', { scope: SCOPE_GLOBAL } )
                    ]
                    ,cast: undefined
                    ,void: false
                    ,globals: new Set( [ 'awaitable' ] )
                } );
            } );
        } );
        
        describe( "handle a callback", () => {
            it( "that has an unparenthesized arg", async () => {
                const text = "mapper( x =>({x}) )";
                const res = parseBindingTextToAst( text, true );
                expect( res  ).toEqual(
                    createCall( 'mapper',  
                        [createCallback( ["x"], createObjectLiteral( [ [ 'x', createLookup( "x", { scope: SCOPE_LOCAL }  ) ] ] ) )
                    ],{import:true})
                );
            } );
            it( "that has an parenthesized arg", () => {
                
                const res = parseBindingTextToAst( "mapper( (x) =>({x}) )", true );
                expect( res  ).toEqual(
                    createCall( 'mapper', [ 
                        createCallback( ["x"], createObjectLiteral( [ [ 'x', createLookup( "x", { scope: SCOPE_LOCAL }  ) ] ] ) )
                    ], { import:true})
                );  
            } );
            it( "that has multiple args", () => {
                
                const res = parseBindingTextToAst( "sort( (a,b) => diff(a,b) )", true );
                expect( res ).toEqual(
                    createCall( 'sort', [ 
                        createCallback( ["a", "b"], createCall( "diff", [ createLookup( "a", { scope: SCOPE_LOCAL }  ), createLookup( "b", { scope: SCOPE_LOCAL }  ) ] ) )
                    ], { import:true} )
                );  
            } );
            /*it( "that has no arg", () => {
                
                const res = parseBindingTextToAst( "mapper( () => y )" );
                expect( res[0] ).toEqual( 
                    createCallback( "x", createLookup( "y" ) )
                );  
            } );*/
        } );
        
        describe( "handle a 'with'-statement", () => {
            it( "that is empty", () => {
                const res = parseInvocation( new Instr( "with() Math.sum(...$)" ), true );
                expect( res.name ).toEqual( [] );  
                expect( res.args ).toEqual( createMethod( "sum", createLookup( "Math", { scope: SCOPE_GLOBAL }  ), [ createUnary( UNARY_REST, createLookup( "$", { scope: SCOPE_GLOBAL } ) ) ]  ) );  
            } );
            it( "that contains an export", () => {
                const res = parseInvocation( new Instr( "with(Archive) new Archive($1)" ), true );
                expect( res.name ).toEqual( [ 'Archive' ] );  
                expect( res.args ).toEqual( createCall( "Archive", [ createLookup( "$1", { scope: SCOPE_GLOBAL }  ) ], { new: true, import: true }  ) );  
            } );
            it( "that (erroneously) has unused imports", () => {
                expect ( () => parseInvocation( new Instr( "with( x, y, z ) x(z())" ) ) ).toThrowError( Error, /Unused imports/ );
            } );
            it( "that has unused imports which are used as property names", () => {
                expect ( () => parseInvocation( new Instr( "with( x, y, z ) x(z({y:1}))" ) ) ).toThrowError( Error, /Unused imports/ );
            } );
            it( "that has unused imports which are used as argument names", () => {
                expect ( () => parseInvocation( new Instr( "with( x, y, z ) x($1.map( (y,z) => a ))" ) ) ).toThrowError( Error, /Unused imports/ );
            } );
            it( "that has unused imports which are used as argument names in a callback", () => {
                expect ( () => parseInvocation( new Instr( "with( x, y ) x($1.map( y => y ))" ) ) ).toThrowError( Error, /Unused imports/ );
            } );
        }  );
        
        it( "should reject multiply used expr imports", () => {
            expect ( () => parseInvocation( new Instr( "x(x())" ) ) ).toThrowError( Error, /should not be referenced - except in the principle call/ );
        } );
        it( "should reject multiply used expr imports - but not be fooled by property names", () => {
            expect ( () => parseInvocation( new Instr( "x({x:1,y:2})" ) ) ).not.toThrow();
        } );
        it( "should mark as global an argument", () => {
            // 2024_6_12: This is problematic because `(a,b,c,d,e)` is first passed as an argument list for a callback; 
            // which is bonkers in this context, because `p(x)=>c` is nonsense.
            expect ( parseInvocation( new Instr( "y(p(a,b,c,d,e))" ) ).globals ).toEqual( new Set( ['p','a','b','c','d','e'] ) );
        } );
        it( "should mark as global an implied property", () => {
            expect ( parseInvocation( new Instr( "y({x})" ) ).globals ).toEqual( new Set( ['x'] ) );
        } );
        it( "should mark as global an explicit property", () => {
            expect ( parseInvocation( new Instr( "y({x:z})" ) ).globals ).toEqual( new Set( ['z'] ) );
        } );
        it( "should NOT mark as global callback arguments", () => {
            expect ( parseInvocation( new Instr( "y(x => x)" ) ).globals ).toEqual( new Set );
        } );
        
        describe( "handle a pipe-expression", () => {
            it( "that pipes the output of one function into another", () => {
                const res = parseInvocation( new Instr( "default( f1() |> f2(%) )" ) );
                expect( res.args ).toEqual( [ createBinary( BINARY_PIPE, createCall( "f1", [] ), createCall( "f2", [ createLookup( "%", { scope: SCOPE_LOCAL } ) ] ), { pipeIndex: 1 } ) ]  );  
            } );
        }  );
    } );

    describe( "of await should", () => {
        it( "be fine at the top level", () => {
            expect( () => parseInvocation( new Instr( "default( await $1.database() )" ) ) ).not.toThrow();
        } );
        
        it( "NOT be allowed in non async callbacks", () => {
            expect( () => parseInvocation( new Instr( "default( (x) => await $1.database() )" ) ) ).toThrowError( Error, StartsWith( "await cannot be used outside of an async context" ) );
        } );
        it( "be permitted in async callbacks", () => {
            // FIXME: we should check the bidning is a promise.
            expect( () => parseInvocation( new Instr( "default( async (x) => await $1.database() )" ) ) ).not.toThrow( );
        } );
    } );
    describe( "of @option should", () => {
        it( "handle a plain @option as a function argument", () => {
            // This is an error, but we can't spot it; somebody else's problem.
            const res = parseInvocation( new Instr( "default(@option fred)" ) )
            expect( res ).toEqual( {
                name: 'default',
                args: [
                    createLookup( "fred", { scope: SCOPE_GLOBAL, option: true, typename: '' } )   
                ] 
                ,cast: undefined
                ,void: false
                ,globals: new Set( [ 'fred' ] )
                
            } );
        } );
        it( "handle a plain @option as a property", () => {
            // This is an error, but we can't spot it; somebody else's problem.
            const res = parseInvocation( new Instr( "default({@option fred})" ) )
            expect( res ).toEqual( {
                name: 'default',
                args: [
                    createObjectLiteral( [ 
                        [ 'fred', createLookup( "fred", { scope: SCOPE_GLOBAL, option: true, typename: '' } ) ]
                    ] )       
                ] 
                ,cast: undefined
                ,void: false
                ,globals: new Set( [ 'fred' ] )
                
            } );
        } );
        it( "handle @option(type) as a function argument", () => {
            // This is an error, but we can't spot it; somebody else's problem.
            const res = parseInvocation( new Instr( "default(@option(string) fred)" ) )
            expect( res ).toEqual( {
                name: 'default',
                args: [
                    createLookup( "fred", { scope: SCOPE_GLOBAL, option: true, typename: 'string' } )   
                ] 
                ,cast: undefined
                ,void: false
                ,globals: new Set( [ 'fred' ] )
                
            } );
        } );
        it( "reject @option(type) it it disagrees with the defaulted type [@OPTION-TYPEMATCH]", () => {
            expect( () => Binding.from( "default(@option(string) wibble = true)" ) ).toThrowError( 
                StartsWith( "defaulted value must have the same type as is declared in the option" )
             );
        } );
        it( "permit multiple untyped, undefaulted redeclarations of @option", () => {
            expect( () => Binding.from( "default(@option wibble,@option wibble)"  ) ).not.toThrow( );
        } )
        it( "permit multiple typed, undefaulted redeclarations of @option", () => {
            expect( () => Binding.from( "default(@option(String) wibble,@option(String) wibble)"  ) ).not.toThrow( );
        } )
        it( "reject multiple typed, undefaulted redeclarations of @option if they differ in type", () => {
            expect( () => Binding.from( "default(@option(String) wibble,@option(Number) wibble)"  ) ).toThrowError( StartsWith( ERROR_MISMATCH ) );
        } )
        it( "permit multiple untyped, defaulted redeclarations of @option", () => {
            expect( () => Binding.from( "default(@option wibble = 4,@option wibble = 4)"  ) ).not.toThrow( );
        } )
        it( "reject multiple untyped, defaulted redeclarations of @option if they differ in default", () => {
            expect( () => Binding.from( "default(@option wibble = 4,@option wibble = 5)"  ) ).toThrowError( StartsWith( ERROR_MISMATCH ) );
        } )
    } );

    // Q: Are these all in the wrong place? Wouldn't parse and eval be more appropiate for all? 
    describe( "the template parser should", () => {
        it( "parse an empty template", () => {
            expect( parseBindingTextToAst( "with () ``" ) ).toEqual( 
                createLiteral( '' )
            );
        } );
        it( "parse a template with a string", () => {
            expect( parseBindingTextToAst( "with () `hello world`" ) ).toEqual( 
                createLiteral( 'hello world' )
            );
        } );
        it( "parse a template with escaped '`'", () => {
            expect( parseBindingTextToAst( "with () `hello \\`Some text\\` world`" ) ).toEqual( 
                createLiteral( 'hello `Some text` world' )
            );
        } );
        // Do we need to test every SingleEscapeCharacter?
          
        it( `parse a template with \\n`, () => {
            expect( parseBindingTextToAst( "with () `hello\\nworld`" ) ).toEqual( 
                createLiteral( 'hello\nworld' )
            );
        } );
        it( `parse a template with \\r`, () => {
            expect( parseBindingTextToAst( "with () `hello\\rworld`" ) ).toEqual( 
                createLiteral( 'hello\rworld' )
            );
        } );
        it( `parse a template with \\t`, () => {
            expect( parseBindingTextToAst( "with () `hello\\tworld`" ) ).toEqual( 
                createLiteral( 'hello\tworld' )
            );
        } );
        it( `parse a template with \\'`, () => {
            expect( parseBindingTextToAst( "with () `hello\\'world`" ) ).toEqual( 
                createLiteral( 'hello\'world' )
            );
        } );
        it( `parse a template with \\"`, () => {
            expect( parseBindingTextToAst( 'with () `hello\\"world`' ) ).toEqual( 
                createLiteral( 'hello\"world' )
            );
        } );
        it( `parse a template with \\\\`, () => {
            expect( parseBindingTextToAst( 'with () `hello\\\\world`' ) ).toEqual( 
                createLiteral( 'hello\\world' )
            );
        } );
        
        it( `parse a template an expression`, () => {
            expect( parseBindingTextToAst( 'with () `hello${` `}world`' ) ).toEqual( 
                createMethod( 'join', createArrayLiteral([ 
                        createLiteral( 'hello' ),
                        createLiteral( ' ' ),
                        createLiteral( 'world' ),
                ]), [ createLiteral( '' ) ] ) 
            );
        } );
        it( "reject unescaped $( [TEMPLATE-NO-$(]", () => {
            // FIXME: we should check the actual sourceStartIndex, etc... params as well.
            expect( 
                () => parseBindingTextToAst( "with () `some$(cmd)thing`" )
                                            //0123456789ABCDEF
            ).toThrowError( 
                Error, /^Embedded CLI calls not yet supported at 13$/ 
            );
        } );
    } );
                        
} );



